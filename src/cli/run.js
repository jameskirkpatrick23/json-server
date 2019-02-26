const fs = require('fs')
const path = require('path')
const jph = require('json-parse-helpfulerror')
const _ = require('lodash')
const chalk = require('chalk')
const pause = require('connect-pause')
const ui = require('./utils/ui')
const is = require('./utils/is')
const load = require('./utils/load')
const jsonServer = require('../server')

function createApp(db, routes, middlewares, argv) {
  const app = jsonServer.create()

  const { foreignKeySuffix } = argv

  let router = jsonServer.router(
    db,
    foreignKeySuffix ? { foreignKeySuffix } : undefined
  )

  const defaultsOpts = {
    logger: !argv.quiet,
    readOnly: argv.readOnly,
    noCors: argv.noCors,
    noGzip: argv.noGzip,
    bodyParser: true
  }

  if (argv.static) {
    defaultsOpts.static = path.join(process.cwd(), argv.static)
  }

  const defaults = jsonServer.defaults(defaultsOpts)
  app.use(defaults)

  if (routes) {
    const rewriter = jsonServer.rewriter(routes)
    app.use(rewriter)
  }

  if (middlewares) {
    app.use(middlewares)
  }

  if (argv.delay) {
    app.use(pause(argv.delay))
  }

  router.db._.id = argv.id
  app.db = router.db
  app.use(router)

  return app
}

module.exports = function(argv) {
  const source = argv._[0]
  let app
  let server

  if (!fs.existsSync(argv.snapshots)) {
    console.log(`Error: snapshots directory ${argv.snapshots} doesn't exist`)
    process.exit(1)
  }

  // noop log fn
  if (argv.quiet) {
    console.log = () => {}
  }

  console.log()
  console.log(chalk.cyan('  \\{^_^}/ hi!'))

  function start(isRestart = false) {
    if (isRestart) ui.clearScreen()
    console.log(chalk.gray('  Loading', source))

    server = undefined

    // create db and load object, JSON file, JS or HTTP database
    return load(source).then(db => {
      // Load additional routes
      let routes
      if (argv.routes) {
        console.log(chalk.gray('  Loading', argv.routes))
        routes = JSON.parse(fs.readFileSync(argv.routes))
      }

      // Load middlewares
      let middlewares
      if (argv.middlewares) {
        middlewares = argv.middlewares.map(function(m) {
          console.log(chalk.gray('  Loading', m))
          return require(path.resolve(m))
        })
      }

      // Done
      console.log(chalk.gray('  Done'))

      // Create app and server
      app = createApp(db, routes, middlewares, argv)
      server = app.listen(argv.port, argv.host)

      // Display server informations
      ui.prettyPrint(argv, db.getState(), routes)

      // Catch and handle any error occurring in the server process
      process.on('uncaughtException', error => {
        if (error.errno === 'EADDRINUSE')
          console.log(
            chalk.red(
              `Cannot bind to the port ${
                error.port
              }. Please specify another port number either through --port argument or through the json-server.json configuration file`
            )
          )
        else console.log('Some error occurred', error)
        process.exit(1)
      })
    })
  }

  // Start server
  start()
    .then(() => {
      // Snapshot
      console.log(
        chalk.gray(
          '  Type s + enter at any time to create a snapshot of the database'
        )
      )

      // Support nohup
      // https://github.com/typicode/json-server/issues/221
      process.stdin.on('error', () => {
        console.log(`  Error, can't read from stdin`)
        console.log(`  Creating a snapshot from the CLI won't be possible`)
      })
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', chunk => {
        if (chunk.trim().toLowerCase() === 's') {
          const filename = `db-${Date.now()}.json`
          const file = path.join(argv.snapshots, filename)
          const state = app.db.getState()
          fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8')
          console.log(
            `  Saved snapshot to ${path.relative(process.cwd(), file)}\n`
          )
        }
      })

      // Watch files
      if (argv.watch) {
        console.log(chalk.gray('\n  Watching...'), '\n')
        const source = argv._[0]

        // Can't watch URL
        if (is.URL(source)) throw new Error("Can't watch URL")

        // Watch .js or .json file
        // Since lowdb uses atomic writing, directory is watched instead of file
        const watchedDir = path.dirname(source)
        fs.watch(watchedDir, (event, file) => {
          // https://github.com/typicode/json-server/issues/420
          // file can be null
          if (file) {
            const watchedFile = path.resolve(watchedDir, file)
            if (watchedFile === path.resolve(source)) {
              if (is.FILE(watchedFile)) {
                let obj
                try {
                  obj = jph.parse(fs.readFileSync(watchedFile))
                } catch (e) {
                  ui.clearScreen()
                  console.log(chalk.red(`  Error reading ${watchedFile}`))
                  console.error(e.message)
                  return
                }

                // Compare .json file content with in memory database
                if (_.isEqual(obj, app.db.getState())) return

                console.log(chalk.gray(`  ${source} has changed, reloading...`))
                server && server.close(() => start(true))
              }
            }
          }
        })

        // Watch routes
        if (argv.routes) {
          const watchedFile = path.resolve(argv.routes)
          fs.watchFile(watchedFile, { interval: 1000 }, (curr, prev) => {
            if (+curr.mtime === +prev.mtime) {
              return
            }

            try {
              jph.parse(fs.readFileSync(watchedFile))
            } catch (e) {
              ui.clearScreen()
              console.log(chalk.red(`  Error reading ${watchedFile}`))
              console.error(e.message)
              return
            }

            console.log(
              chalk.gray(`  ${argv.routes} has changed, reloading...`)
            )
            server && server.close(() => start(true))
          })
        }
      }
    })
    .catch(err => {
      console.log(err)
      process.exit(1)
    })
}
