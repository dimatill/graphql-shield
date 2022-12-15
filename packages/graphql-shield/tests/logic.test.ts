import { graphql, GraphQLResolveInfo } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'

import { shield, rule, allow, deny, and, or, not } from '../src'
import { LogicRule } from '../src/rules'
import { chain, race } from '../src/constructors'

describe('logic rules', () => {
  test('allow, deny work as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
      }
    `

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    // Permissions
    const ruleTree = {
      Query: {
        allow: allow,
        deny: deny,
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        allow
        deny
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
    })
    expect(res.errors?.length).toBe(1)
  })

  test('and works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
      }
    `

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'ruleError',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    const ruleWithError = rule()(async () => {
      throw new Error()
    })

    const ruleTree = {
      Query: {
        allow: and(allow, allow),
        deny: and(allow, deny),
        ruleError: and(allow, ruleWithError),
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
    })
    expect(res.errors?.length).toBe(2)
  })

  test('chain works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
      }
    `

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'error',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    let allowRuleSequence: string[] = []
    const allowRuleA = rule()(() => {
      allowRuleSequence.push('A')
      return true
    })
    const allowRuleB = rule()(() => {
      allowRuleSequence.push('B')
      return true
    })
    const allowRuleC = rule()(() => {
      allowRuleSequence.push('C')
      return true
    })
    let denyRuleCount = 0
    const denyRule = rule({})(() => {
      denyRuleCount += 1
      return false
    })
    let ruleWithErrorCount = 0
    const ruleWithError = rule()(() => {
      ruleWithErrorCount += 1
      throw new Error('error')
    })

    const ruleTree = {
      Query: {
        allow: chain(allowRuleA, allowRuleB, allowRuleC),
        deny: chain(denyRule, denyRule, denyRule),
        ruleError: chain(ruleWithError, ruleWithError, ruleWithError),
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
    })
    expect(allowRuleSequence.toString()).toEqual(['A', 'B', 'C'].toString())
    expect(denyRuleCount).toEqual(1)
    expect(ruleWithErrorCount).toEqual(1)
    expect(res.errors?.length).toBe(2)
  })

  test('race chain works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
      }
    `

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'error',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    let allowRuleSequence: string[] = []
    const denyRuleA = rule()(() => {
      allowRuleSequence.push('A')
      return false
    })
    const allowRuleB = rule()(() => {
      allowRuleSequence.push('B')
      return true
    })
    const allowRuleC = rule()(() => {
      allowRuleSequence.push('C')
      return true
    })
    let denyRuleCount = 0
    const denyRule = rule({})(() => {
      denyRuleCount += 1
      return false
    })
    let ruleWithErrorCount = 0
    const ruleWithError = rule()(() => {
      ruleWithErrorCount += 1
      throw new Error('error')
    })

    const ruleTree = {
      Query: {
        allow: race(denyRuleA, allowRuleB, allowRuleC),
        deny: race(denyRule, denyRule, denyRule),
        ruleError: race(ruleWithError, ruleWithError, ruleWithError),
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: null,
    })
    expect(allowRuleSequence.toString()).toEqual(['A', 'B'].toString())
    expect(denyRuleCount).toEqual(3)
    expect(ruleWithErrorCount).toEqual(3)
    expect(res.errors?.length).toBe(2)
  })

  test('or works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
      }
    `

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    const ruleTree = {
      Query: {
        allow: or(allow, deny),
        deny: or(deny, deny),
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        allow
        deny
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    /* Tests */

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
    })
    expect(res.errors?.length).toBe(1)
  })

  test('not works as expected', async () => {
    const typeDefs = `
      type Query {
        allow: String
        deny: String
        ruleError: String
        resolverError: String
        customRuleError: String
        customRuleErrorString: String
      }
    `

    const resolvers = {
      Query: {
        allow: () => 'allow',
        deny: () => 'deny',
        ruleError: () => 'ruleError',
        resolverError: () => {
          throw new Error()
        },
        customRuleError: () => 'customRuleError',
        customRuleErrorString: () => 'customRuleErrorString',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    const ruleWithError = rule()(async () => {
      throw new Error()
    })

    const ruleWithCustomError = rule()(async () => {
      return new Error('error_pass')
    })

    const ruleWithCustomErrorString = rule()(async () => {
      return 'error_string_pass'
    })

    const ruleTree = {
      Query: {
        allow: not(deny),
        deny: not(allow),
        ruleError: not(ruleWithError),
        resolverError: not(allow),
        customRuleError: not(ruleWithCustomError),
        customRuleErrorString: not(ruleWithCustomErrorString),
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        allow
        deny
        ruleError
        resolverError
        customRuleError
        customRuleErrorString
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    expect(res.data).toEqual({
      allow: 'allow',
      deny: null,
      ruleError: 'ruleError',
      resolverError: null,
      customRuleError: 'customRuleError',
      customRuleErrorString: 'customRuleErrorString',
    })
    expect(res.errors?.map((err) => err.message)).toEqual(['Not Authorised!', 'Not Authorised!'])
  })

  test('not returns custom error', async () => {
    const typeDefs = `
      type Query {
        not: String
      }
    `

    const resolvers = {
      Query: {
        not: () => 'not',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    const ruleTree = {
      Query: {
        not: not(allow, 'This is a custom not message.'),
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        not
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    expect(res.data).toEqual({
      not: null,
    })
    expect(res.errors?.map((err) => err.message)).toEqual(['This is a custom not message.'])
  })
})

describe('internal execution', () => {
  test('logic rule by default resolves to false', async () => {
    const rule = new LogicRule([])

    const res = await rule.resolve({}, {}, { _shield: { cache: {} } }, {} as GraphQLResolveInfo, {
      allowExternalErrors: false,
      debug: false,
      fallbackRule: allow,
      fallbackError: new Error(),
      hashFunction: () => `${Math.random()}`,
      disableFragmentsAndPostExecRules: false,
    })

    expect(res).toBeFalsy()
  })

  test('rule prevents access when access not permited', async () => {
    const typeDefs = `
      type Query {
        deny: String
      }
    `

    const resolvers = {
      Query: {
        deny: () => 'deny',
      },
    }

    const schema = makeExecutableSchema({ typeDefs, resolvers })

    /* Permissions */

    const ruleDeny = rule()(() => false)

    const ruleTree = {
      Query: {
        deny: ruleDeny,
      },
    }

    const schemaWithPermissions = shield(schema, ruleTree)

    /* Execution */

    const query = `
      query {
        deny
      }
    `
    const res = await graphql({
      schema: schemaWithPermissions,
      source: query,
    })

    /* Tests */

    expect(res.data).toEqual({
      deny: null,
    })
    expect(res.errors?.length).toBe(1)
  })
})
