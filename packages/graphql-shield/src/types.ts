import { GraphQLResolveInfo } from 'graphql'
import { IMiddlewareGenerator } from 'graphql-middleware'

// Rule

export type ShieldRule = IRule | ILogicRule

export interface IRule {
  readonly name: string

  equals(rule: IRule): boolean
  extractFragment(): IFragment | undefined
  resolve(parent: object, args: object, ctx: IShieldContext, info: GraphQLResolveInfo, options: IOptions): Promise<IRuleResult>
}

export interface IRuleOptions {
  cache: ICache
  fragment?: IFragment
}

export interface ILogicRule {
  getRules(): ShieldRule[]
  extractFragments(): IFragment[]
  evaluate(parent: object, args: object, ctx: IShieldContext, info: GraphQLResolveInfo, options: IOptions): Promise<IRuleResult[]>
  resolve(parent: object, args: object, ctx: IShieldContext, info: GraphQLResolveInfo, options: IOptions): Promise<IRuleResult>
}

export type IFragment = string
export type ICache = 'strict' | 'contextual' | 'no_cache' | ICacheKeyFn
export type ICacheKeyFn = (parent: any, args: any, ctx: any, info: GraphQLResolveInfo) => string
export type IRuleResult = boolean | string | Error
export type IRuleFunction = (parent: any, args: any, ctx: any, info: GraphQLResolveInfo) => IRuleResult | Promise<IRuleResult>

// Rule Constructor Options

export type ICacheContructorOptions = ICache | boolean

export interface IRuleConstructorOptions {
  cache?: ICacheContructorOptions
  fragment?: IFragment
}

// Rules Definition Tree

export interface IRuleTypeMap {
  [key: string]: ShieldRule | IRuleFieldMap
}

export interface IRuleFieldMap {
  [key: string]: ShieldRule
}

export type IRules = ShieldRule | IRuleTypeMap

export type IHashFunction = (arg: { parent: any; args: any }) => string

export type IFallbackErrorMapperType = (
  err: unknown,
  parent: object,
  args: object,
  ctx: IShieldContext,
  info: GraphQLResolveInfo,
) => Promise<Error> | Error

export type IFallbackErrorType = Error | IFallbackErrorMapperType

// Generator Options

export interface IOptions {
  runAuthAfterResolver: boolean
  debug: boolean
  allowExternalErrors: boolean
  fallbackRule: ShieldRule
  fallbackError?: IFallbackErrorType
  hashFunction: IHashFunction
}

export interface IOptionsConstructor {
  debug?: boolean
  allowExternalErrors?: boolean
  fallbackRule?: ShieldRule
  fallbackError?: string | IFallbackErrorType
  hashFunction?: IHashFunction
}

export declare function shield<TSource = any, TContext = any, TArgs = any>(
  ruleTree: IRules,
  options: IOptions,
): IMiddlewareGenerator<TSource, TContext, TArgs>

export interface IShieldContext {
  _shield: {
    cache: { [key: string]: IRuleResult | Promise<IRuleResult> }
  }
}
