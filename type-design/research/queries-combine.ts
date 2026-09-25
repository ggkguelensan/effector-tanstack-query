import {createStore, type Store} from 'effector'
import {expectTypeOf} from 'vitest'
import {queryOptions} from '@tanstack/react-query'
import type {QueryObserverOptions,QueryKey,DefaultError} from '@tanstack/query-core'
import type {QueryItemState,QueriesResult} from '../../packages/core/src/types'
import {todoOptions, type Todo} from '../fixtures/todo.qo'
declare function candidate<I,F,E=DefaultError,D=F,K extends QueryKey=QueryKey,C=unknown>(options:{
 source:Store<ReadonlyArray<I>>
 query:(item:I)=>QueryObserverOptions<F,E,D,F,K>
 combine:(items:ReadonlyArray<QueryItemState<NoInfer<I>,NoInfer<D>,NoInfer<E>>>)=>C
}):QueriesResult<I,D,E>&{$combined:Store<C>}
const $params=createStore<Array<{todoId:number}>>([])
const result=candidate({source:$params,query:todoOptions,combine:items=>{
 expectTypeOf(items[0]!.data).toEqualTypeOf<Todo|undefined>()
 return {titles:items.flatMap(item=>item.data===undefined?[]:[item.data.title]),pending:items.some(item=>item.isPending)}
}})
expectTypeOf(result.$combined).toEqualTypeOf<Store<{titles:string[];pending:boolean}>>()
expectTypeOf(result.$data).toEqualTypeOf<Store<ReadonlyArray<Todo|undefined>>>()
const titleOptions=(params:{todoId:number})=>queryOptions({...todoOptions(params),select:todo=>todo.title})
const selected=candidate({source:$params,query:titleOptions,combine:items=>{
 expectTypeOf(items[0]!.data).toEqualTypeOf<string|undefined>()
 return items.map(item=>item.data)
}})
expectTypeOf(selected.$combined).toEqualTypeOf<Store<Array<string|undefined>>>()
