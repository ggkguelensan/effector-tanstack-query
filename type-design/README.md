# Factory API: проверка типов до runtime-реализации

Актуальная сводка целевого состояния, границ issues и PR: [design/README.md](./design/README.md).
Этот первоначальный отчёт описывает декларационный прототип; более поздние решения
о scope, нормализации options и отдельных follow-up issues зафиксированы в design.

Основа: `origin/master` на `08c41a7`. Проверяемый TanStack: **5.100.10**.
Этот каталог — проект публичных типов и компилируемые проверки. Runtime адаптеров,
публичные exports и package manifests не изменены.

## Цель

1. Приложение с существующими `.qo`, `.qk`, `.mo` подключает Effector, сохраняя
   определения factories и импорты helpers из TanStack.
2. Effector-приложение определяет переносимые factories с helpers из core.
3. Inline и factory — две формы одних адаптеров; старые вызовы и inference сохраняются.

## Предлагаемые контракты

- `OptionsSource = Store<unknown> | Readonly<Record<string, Store<unknown>>>`.
- `SourceValue<S>` разрешает один store или каждый store объекта. Значения внутри
  store (включая readonly объекты и массивы) сохраняют свой тип. Вложенные объекты
  stores рекурсивно не раскрываются; события источниками не являются.
- `CreateQueryFactoryOptions<S, FnData, Error, Data, Key>` принимает полный
  `QueryObserverOptions`, включая callback `enabled`.
- `CreateInfiniteQueryFactoryOptions<S, FnData, Error, PageParam, Data, Key>`
  принимает `InfiniteQueryObserverOptions`.
- Для мутаций устойчивее сначала вывести конкретный возвращаемый объект options:
  `CreateMutationFactoryOptions<S, Options>`, затем получить data/error/variables/
  rollback context из него. См. соответствующее наблюдение ниже.
- Общие query overrides: `name`, `enabled: boolean | Store<boolean> | undefined`,
  `refetchInterval: TanStackInterval | Store<number | false | undefined>`.
  `NoInfer` предотвращает влияние polling callback на вывод основного типа options.
- Inline сохраняет порядок generic-параметров. У каждой factory-формы есть
  перегрузки с явным `QueryClient` и без него.
- Запрет смешивания форм задаётся через поля `?: never`, включая старые TanStack
  options на верхнем уровне factory-формы. Проверены литералы, переменные и spread.
- Метаданные Effector и React-only `subscribed` отсутствуют в локальных helpers.
  Helpers используют core-типы и сохраняют перегрузки TanStack.

Точные декларации: [contracts.ts](./contracts.ts).

## Что компилируется

- Готовые local/native query, infinite и mutation factories с обоими overloads.
- Параметры store/shape, readonly значения, nullable параметры, пустой source.
- Вложенные ключи из `.qk`, тип `signal`, ошибка, выбранные данные и finished events.
- Полные options, callback `enabled`, store/function `refetchInterval`.
- Helpers в `QueryClient`, `useQuery`, `useQueries`, `useSuspenseQuery`,
  `useInfiniteQuery`, `useMutation`; composition между local/native helpers.
- Cache `DataTag` сохраняет raw data и error независимо от `select`.
- `initialData` сужает native hook result; Effector `$data` сохраняет `undefined`
  до инициализации. Conditional `skipToken` принимается query, но не Suspense.
- Mutation context не смешивается с variables; `mutate` совместим с `sample`.
- Исправленный mutation result сохраняет rollback context в `mutateWith`.
- Существующие core/react type-тесты динамически переподключаются к новым overloads.
- `Register.defaultError` / metadata, включая сохранение прежнего `Error` по
  умолчанию у inline-формы.
- Декларации helpers и предложенного интерфейса успешно выпускаются через `tsc`.

## Выявленные несоответствия

### 1. Spread + select во вложенной callback-фабрике

Такой вызов в проверенном варианте generic-деклараций теряет тип аргумента `select`:

```ts
createQuery({
  source: $id,
  query: id => ({
    ...todoOptions({ todoId: id }),
    select: todo => todo.title, // todo: unknown
  }),
})
```

Две проверенные формы сохраняют тип:

```ts
query: id => queryOptions({
  ...todoOptions({ todoId: id }),
  select: todo => todo.title,
})

// Либо явный тип параметра callback:
query: (id: number) => ({
  ...todoOptions({ todoId: id }),
  select: todo => todo.title,
})
```

Прямая передача `query: todoOptions` работает. Проблема возникает при одновременном
контекстном выводе параметра внешней callback и внутренних callbacks возвращаемого
объекта. `NoInfer` на `select` её не исправил. Вариант с helper — предложение по
документированному способу композиции, а не молчаливое изменение согласованной
эргономики. Точное поведение воспроизводится в `inference-limits.test-d.ts`.

Дополнительное исследование: [research/README.md](./research/README.md).
Проблема сведена к примеру без обеих библиотек, воспроизведена на TypeScript
5.7.3 / 5.9.3 / 6.0.3 / 7.0.2 и объяснена через трассировку копии компилятора.
Исследованные семейства деклараций не дали решения исходной записи; это не
универсальное доказательство невозможности любого альтернативного объявления.

### 2. Нельзя переиспользовать boolean-only CreateQueriesItemOptions

Стандартный `queryOptions()` возвращает options с типом `enabled`, допускающим
callback, даже если поле не было передано. Factory query принимает полный
`QueryObserverOptions`; runtime должен согласованно обработать callback в observer,
prefetch и Suspense.

### 3. Mutation error может ошибочно выводиться как null

Первый вариант использовал `(source) => MutationObserverOptions<Data, Error, Variables, Context>`.
При вложенном `mutationOptions()` и зарегистрированном default error TypeScript
вывел `Error = null`. Извлечение generic-параметров из конкретного результата
factory исправляет этот случай. Проверены custom error, явно заданный `unknown`,
void/unknown variables и async `onMutate`.

`any` в `MutationDefinition` используется только для проверки совместимости
с любым типизированным MutationObserverOptions через отложенную `NoInfer`-проверку;
контекст возвращаемого объекта им не типизируется. В результат передаётся конкретный
выведенный тип объекта. Для локальной композиции callbacks нужен helper или явные
аннотации: голый возвращаемый объект даёт implicit-any ошибку, а не скрытое принятие
нетипизированных callbacks.

### 4. Rollback context теряется в существующем MutationResult

`TOnMutateResult` есть на входе, но отсутствует в текущем результате и в типах
`mutateWith`. Предложенный `MutationFactoryResult` сохраняет его.
Изменение требует одновременно провести дополнительный generic через
`MutationResult`, React `UseMutationResult` и `useMutation` (с совместимым default).
Текущий React hook отвергает уточнённый результат; предложенный контракт из
`react-contracts.ts` принимает его. Это должна быть одна атомарная правка.

### 5. infiniteQueryOptions 5.100.10 расширяет часть pageParams до unknown[]

Это поведение самого upstream helper: default `TData` и `DataTag` используют
`InfiniteData<Page>` с default `unknown` для page params. `queryFn.pageParam` и
`fetchInfiniteQuery()` при этом сохраняют выведенный тип параметра страницы.
Прототип воспроизводит upstream-поведение и не обещает восстановить потерянную
информацию в `$data`. Улучшение helper должно обсуждаться отдельно от копирования.

### 6. Зарегистрированный QueryKey несовместим с текущими legacy-типами

`Register.queryKey = readonly ['app', ...unknown[]]` даёт пять TS2344 в текущем
`packages/core/src/types.ts`. Это существующая проблема, существенная для сценария
подключения к уже типизированному TanStack-приложению.

Проверен проект исправления: Effector key выводится из зарегистрированного
`QueryKey` отображением элементов в `StoreOrValue`, а типы family ограничиваются
`QueryKey`. Сгенерированный вариант проходит тесты валидных/невалидных inline и
factory keys. Production-файл пока не изменён.

### 7. Peer range ^5.0.0 слишком широк для копирования современных helpers

В опубликованном `@tanstack/query-core@5.0.0` DataTag принимает два generic-параметра,
а используемые helpers 5.100.10 требуют три. В той версии также отсутствуют
`NonUndefinedGuard`, `OmitKeyof` и error-tag inference из современного helper.

Нужно явно определить и проверить минимальную поддерживаемую версию. Нельзя
копировать helpers 5.100.10 и считать диапазон ^5.0.0 проверенным. Эта проверка
устанавливает несовместимость нижней границы, а не точную минимальную версию.

## Воспроизведение

После установки зависимостей workspace:

```sh
node type-design/check.mjs

# Проверка с нижней minor-версией TypeScript из devDependencies:
npm exec --yes --package=typescript@5.7.3 -- node type-design/check.mjs --path-tsc
```

Runner создаёт игнорируемые `.generated`, `dist` и ссылки на уже установленные
TanStack packages в локальном `node_modules`. Он проверяет рабочие контракты,
существующие type-тесты, defaults, проект исправления registered keys, declaration
emit, а затем отдельно подтверждает пять известных ошибок исходных key-типов.
Успешное завершение означает также, что известные несоответствия воспроизведены,
а не что все перечисленные решения уже внесены в библиотеку.

Дополнительно исследован `exactOptionalPropertyTypes`: исходный runtime-код
библиотеки уже не проходит эту настройку; native optional options также могут
отвергать явно переданный `undefined`. Она не включена в конфигурации проекта и
не входит в passing gate этого прототипа.

## Решения до реализации

1. Согласовать показанную форму композиции с helper либо продолжить поиск
   деклараций, сохраняющих inference исходного bare-object примера.
2. Включить исправление registered keys в подготовительный type-refactor.
3. Провести rollback context через core/React типы одним изменением.
4. Определить проверяемую нижнюю границу TanStack peer dependency.
5. Сохранить текущую типовую семантику upstream infinite helper либо отдельно
   согласовать её улучшение.

Runtime-семантика `source` для выполняющейся мутации остаётся отдельным решением;
проверка типов сама по себе её не определяет.
