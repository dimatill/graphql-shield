import {
  IMiddleware,
  IMiddlewareFunction,
  IMiddlewareGeneratorConstructor,
} from 'graphql-middleware'
import {
  GraphQLSchema,
  GraphQLObjectType,
  isObjectType,
  isIntrospectionType,
  GraphQLResolveInfo,
} from 'graphql'
import {
  IRules,
  IOptions,
  ShieldRule,
  IRuleFieldMap,
  IShieldContext,
} from './types.js'
import {
  isRuleFunction,
  isRuleFieldMap,
  isRule,
  isLogicRule,
  withDefault,
} from './utils.js'
import { ValidationError } from './validation.js'
import { IMiddlewareWithOptions } from 'graphql-middleware/dist/types'

/**
 *
 * @param options
 *
 * Generates a middleware function from a given rule and
 * initializes the cache object in context.
 *
 */
function generateFieldMiddlewareFromRule(
  rule: ShieldRule,
  options: IOptions,
): IMiddlewareFunction<object, object, IShieldContext> {
  async function middleware(
    resolve: (
      parent: object,
      args: object,
      ctx: IShieldContext,
      info: GraphQLResolveInfo,
    ) => Promise<any>,
    parent: { [key: string]: any },
    args: { [key: string]: any },
    ctx: IShieldContext,
    info: GraphQLResolveInfo,
  ) {
    // Cache
    if (!ctx) {
      ctx = {} as IShieldContext
    }

    if (!ctx._shield) {
      ctx._shield = {
        cache: {},
      }
    }

    // Execution
    try {
      let res
      
      if (!options.runAuthAfterResolver) {
        res = await rule.resolve(parent, args, ctx, info, options)
      }
      
      const resolverResult = await resolve(parent, args, ctx, info)
      
      if (options.runAuthAfterResolver) {
        res = await rule.resolve(parent, args, ctx, info, options)
      }
      
      if (res === true) {
        return resolverResult
      } else if (res === false) {
        if (typeof options.fallbackError === 'function') {
          return await options.fallbackError(null, parent, args, ctx, info)
        }
        return options.fallbackError
      } else {
        return res
      }
    } catch (err) {
      if (options.debug) {
        throw err
      } else if (options.allowExternalErrors) {
        return err
      } else {
        if (typeof options.fallbackError === 'function') {
          return await options.fallbackError(err, parent, args, ctx, info)
        }
        return options.fallbackError
      }
    }
  }

  if (isRule(rule) && rule.extractFragment()) {
    return {
      fragment: rule.extractFragment(),
      resolve: middleware,
    } as IMiddlewareWithOptions<object, object, IShieldContext>
  }

  if (isLogicRule(rule)) {
    return {
      fragments: rule.extractFragments(),
      resolve: middleware,
    } as IMiddlewareWithOptions<object, object, IShieldContext>
  }

  return middleware as IMiddlewareFunction<object, object, IShieldContext>
}

/**
 *
 * @param type
 * @param rules
 * @param options
 *
 * Generates middleware from rule for a particular type.
 *
 */
function applyRuleToType(
  type: GraphQLObjectType,
  rules: ShieldRule | IRuleFieldMap,
  options: IOptions,
): IMiddleware {
  if (isRuleFunction(rules)) {
    /* Apply defined rule function to every field */
    const fieldMap = type.getFields()

    const middleware = Object.keys(fieldMap).reduce((middleware, field) => {
      return {
        ...middleware,
        [field]: generateFieldMiddlewareFromRule(rules, options),
      }
    }, {})

    return middleware
  } else if (isRuleFieldMap(rules)) {
    /* Apply rules assigned to each field to each field */
    const fieldMap = type.getFields()

    /* Extract default type wildcard if any and remove it for validation */
    const defaultTypeRule = rules['*']
    const {'*': _, ...rulesWithoutWildcard} = rules;
    /* Validation */

    const fieldErrors = Object.keys(rulesWithoutWildcard)
      .filter((type) => !Object.prototype.hasOwnProperty.call(fieldMap, type))
      .map((field) => `${type.name}.${field}`)
      .join(', ')

    if (fieldErrors.length > 0) {
      throw new ValidationError(
        `It seems like you have applied rules to ${fieldErrors} fields but Shield cannot find them in your schema.`,
      )
    }

    /* Generation */

    const middleware = Object.keys(fieldMap).reduce(
      (middleware, field) => ({
        ...middleware,
        [field]: generateFieldMiddlewareFromRule(
          withDefault(defaultTypeRule || options.fallbackRule)(rules[field]),
          options,
        ),
      }),
      {},
    )

    return middleware
  } else {
    /* Apply fallbackRule to type with no defined rule */
    const fieldMap = type.getFields()

    const middleware = Object.keys(fieldMap).reduce(
      (middleware, field) => ({
        ...middleware,
        [field]: generateFieldMiddlewareFromRule(options.fallbackRule, options),
      }),
      {},
    )

    return middleware
  }
}

/**
 *
 * @param schema
 * @param rule
 * @param options
 *
 * Applies the same rule over entire schema.
 *
 */
function applyRuleToSchema(
  schema: GraphQLSchema,
  rule: ShieldRule,
  options: IOptions,
): IMiddleware {
  const typeMap = schema.getTypeMap()

  const middleware = Object.keys(typeMap)
    .filter((type) => !isIntrospectionType(typeMap[type]))
    .reduce((middleware, typeName) => {
      const type = typeMap[typeName]

      if (isObjectType(type)) {
        return {
          ...middleware,
          [typeName]: applyRuleToType(type, rule, options),
        }
      } else {
        return middleware
      }
    }, {})

  return middleware
}

/**
 *
 * @param rules
 * @param wrapper
 *
 * Converts rule tree to middleware.
 *
 */
function generateMiddlewareFromSchemaAndRuleTree(
  schema: GraphQLSchema,
  rules: IRules,
  options: IOptions,
): IMiddleware {
  if (isRuleFunction(rules)) {
    /* Applies rule to entire schema. */
    return applyRuleToSchema(schema, rules, options)
  } else {
    /**
     * Checks type map and field map and applies rules
     * to particular fields.
     */
    const typeMap = schema.getTypeMap()

    /* Validation */

    const typeErrors = Object.keys(rules)
      .filter((type) => !Object.prototype.hasOwnProperty.call(typeMap, type))
      .join(', ')

    if (typeErrors.length > 0) {
      throw new ValidationError(
        `It seems like you have applied rules to ${typeErrors} types but Shield cannot find them in your schema.`,
      )
    }

    // Generation

    const middleware = Object.keys(typeMap)
      .filter((type) => !isIntrospectionType(typeMap[type]))
      .reduce<IMiddleware>((middleware, typeName) => {
        const type = typeMap[typeName]

        if (isObjectType(type)) {
          return {
            ...middleware,
            [typeName]: applyRuleToType(type, rules[typeName], options),
          }
        } else {
          return middleware
        }
      }, {})

    return middleware
  }
}

/**
 *
 * @param ruleTree
 * @param options
 *
 * Generates middleware from given rules.
 *
 */
export function generateMiddlewareGeneratorFromRuleTree<
  TSource = any,
  TContext = any,
  TArgs = any
>(
  ruleTree: IRules,
  options: IOptions,
): IMiddlewareGeneratorConstructor<TSource, TContext, TArgs> {
  return (schema: GraphQLSchema) =>
    generateMiddlewareFromSchemaAndRuleTree(schema, ruleTree, options)
}
