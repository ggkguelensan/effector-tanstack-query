import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { QueryClient, QueryObserver } = require('../../packages/core/node_modules/@tanstack/query-core')

async function check(notifyOnChangeProps) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
  const data = { id: 1, title: 'todo' }
  client.setQueryData(['todo'], data)
  let resolveFetch
  const observer = new QueryObserver(client, {
    queryKey: ['todo'],
    queryFn: () => new Promise(resolve => { resolveFetch = resolve }),
    enabled: false,
    notifyOnChangeProps,
  })
  const notifications = []
  const unsubscribe = observer.subscribe(result => notifications.push(result.isFetching))
  const pending = observer.refetch()
  const during = {
    actualIsFetching: observer.getCurrentResult().isFetching,
    notifications: [...notifications],
  }
  resolveFetch(data)
  await pending
  const result = { notifyOnChangeProps, during, finalNotifications: notifications }
  unsubscribe()
  client.clear()
  return result
}

const filtered = await check(['data'])
const complete = await check('all')
console.log(JSON.stringify({ filtered, complete }, null, 2))
if (!filtered.during.actualIsFetching || filtered.finalNotifications.length !== 0 ||
    complete.finalNotifications.join(',') !== 'true,false') {
  throw new Error('Notification behavior changed; review the recorded policy finding.')
}
