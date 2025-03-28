const _ = require('lodash')
const express = require('express')
const pluralize = require('pluralize')
const delay = require('./delay')

module.exports = opts => {
  const router = express.Router()
  router.use(delay)

  // Rewrite URL (/:resource/:id/:nested -> /:nested) and request query
  function get(req, res, next) {
    const prop = pluralize.singular(req.params.resource)
    req.query[`${prop}${opts.foreignKeySuffix}`] = parseInt(req.params.id)
    req.url = `/${req.params.nested}`
    next()
  }

  // Rewrite URL (/:resource/:id/:nested -> /:nested) and request body
  function post(req, res, next) {
    const id = parseInt(req.params.id)
    const prop = pluralize.singular(req.params.resource) + opts.foreignKeySuffix
    if (_.isArray(req.body)) {
      req.body = req.body.map(r => ({
        ...r,
        [prop]: id
      }))
    } else {
      req.body[prop] = id
    }
    req.url = `/${req.params.nested}`
    next()
  }

  return router
    .get('/:resource/:id/:nested', get)
    .post('/:resource/:id/:nested', post)
}
