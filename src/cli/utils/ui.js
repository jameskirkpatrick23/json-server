const chalk = require('chalk')

module.exports = {
  clearScreen() {
    console.log('\u001B[2J\u001B[0;0f')
  },
  prettyPrint(argv, object, rules) {
    const root = `http://${argv.host}:${argv.port}`

    console.log(chalk.bold('\n  Resources'))
    for (let prop in object) {
      console.log(`  ${root}/${prop}`)
    }

    if (rules && Object.keys(rules).length) {
      console.log(chalk.bold('\n  Other routes'))
      for (var rule in rules) {
        console.log(`  ${rule} -> ${rules[rule]}`)
      }
    }

    console.log(chalk.bold('\n  Home'))
    console.log(`  ${root}`)
    console.log()
  }
}
