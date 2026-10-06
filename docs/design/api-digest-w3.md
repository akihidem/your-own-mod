# Claude Code plugin API digest for W3 (emitter and templates)

Extracted 2026-10-06 from the engine-written declaration file of Claude Code 2.1.290 (`claude-code.d.ts`). EARLY ACCESS API: the declaration file is the authority. Only what the generated module (DESIGN.md §7) and its tests use is kept; doc comments are kept because they state what a hook may rewrite and what is pinned.

Mod layout: `.claude-plugin/plugin.json` (name, version, description, author, license, userConfig), `hooks/hooks.json` = `{"modules": ["./register.ts"]}`, `hooks/register.ts` exporting `register: Register`. Tests: `hooks/*.test.ts` importing `test`, `expect`, `mock` from `'claude-code/testing'`, run by `claude plugin test <dir>`; `claude plugin validate --strict <dir>` checks the manifest and the module source. A hook is `($, e, next)`: `$` is the engine interface, `e` the event input, `next(e)` runs the plugins beneath and the engine. A guard is written `on(...).catch(($, e, next) => next.called ? next(e) : { deny: 'why' })`. The module runs with no DOM and no Node (no `require`, no `import()`); `import type { Register } from 'claude-code'` is empty at run time. userConfig values arrive as `register(on, options)`'s `options` (DESIGN §5.5 names the keys).

userConfig field schema (from the plugin manifest reference): each key is an identifier (letters, digits, underscores, not starting with a digit); each value is a strict object: `type` (string|number|boolean|directory|file, required), `title` (required), `description` (required), `required`, `default` (string, number, boolean or array of strings), `options` (string fields only; fixed picker values), `multiple` (string: array of strings), `sensitive`, `min`/`max` (number). Unknown keys inside a field are errors. Plugin `name` must be kebab-case and must not start with `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-`. Marketplace file `.claude-plugin/marketplace.json`: `{ "name": ..., "owner": { "name": ... }, "plugins": [ { "name": <plugin name>, "source": "./" } ] }`.


## `Register` (L8990)

```ts
  /**
   * The hooks module's entry: `export function register(on, options)`. `on`
   * registers hooks; `options` is the plugin's configuration (PluginOptions).
   *
   * The options are fixed for this activation: a change to them reloads the
   * plugin and `register` runs again with the new object. Hooks close over it.
   * Its return is dropped, a promise awaited: `on => on(...)` is a module.
   *
   * @example
   * on("tool.call", ($, e, next) => e.tool === "Bash" ? { deny: "no" } : next(e))
   */
  export type Register = (on: On, options: PluginOptions) => unknown;
```


## `On` (L6551)

```ts
  /**
   * Registers `hook` on the events `pattern` selects: one by name, every one
   * under a namespace (`classic.*`), all (`*`), or all but some (`!tool.*`).
   *
   * One function stands on every selected event (`next.event` says which),
   * under a matcher for the inputs it matches; a plugin's registrations nest
   * in order, first outermost; a repeat throws. Returns the Registration.
   *
   * @see HookBudget the time each hook has per dispatch (its own time: waits
   * on `next` and `$` are free), read live from `next.budget`
   */
  export type On = {
      <P extends Pattern>(pattern: P, hook: NoInfer<HookFor<P>>): Registration<HookFor<P>>;
      <P extends Pattern, const M extends MatcherFor<P>>(pattern: P, matcher: M, hook: NoInfer<MatchedHook<P, M>>): Registration<MatchedHook<P, M>>;
  };
```


## `PluginOptions` (L7416)

```ts
  /**
   * A plugin's options as `register(on, options)` receives them: the values of
   * the fields its manifest's `userConfig` declares, defaults filled in.
   *
   * Stored in settings.json `pluginConfigs[<plugin>].options` (sensitive ones
   * in secure storage), validated against the declared `type` before the module
   * loads; a required field with no value fails the load, naming the field. A
   * string field that declares `options` holds one of them: `/config` draws it
   * as a picker over them, and a stored value outside them counts as unset, so
   * its default applies. A `--plugin-dir` plugin's key is its plugin.json
   * `<name>` (or `<name>@inline`).
   */
  export type PluginOptions = Readonly<Record<string, string | number | boolean | readonly string[]>>;
```


## `SessionStartInput` (L11336)

```ts
  /**
   * The input of `session.start`: the session the process starts with, read the
   * way `$.session` reads it at that moment.
   */
  export type SessionStartInput = {
      /**
       * The directory the session runs in, absolute (`$.session.cwd()`).
       */
      cwd: string;
      /**
       * Where the session draws at start (`$.session.surfaces()[0]`): `terminal`
       * under the REPL; null for a `-p` run or the SDK, which draw nowhere yet.
       */
      surface: RenderSurface | null;
      /**
       * Whether a person is at the prompt: true under the REPL, false for a `-p`
       * run or the SDK.
       */
      isInteractive: boolean;
  };
```


## `PromptSubmitInput` (L8740)

```ts
  /**
   * The input of `prompt.submit`: the prompt as typed, after the input became
   * a user message and before it enters the session.
   */
  export type PromptSubmitInput = {
      /**
       * The prompt's text as it will reach the model (pastes already expanded).
       */
      text: string;
      /**
       * Present only when the submission carried images or other non-text items.
       */
      attachments?: readonly PromptSubmitAttachment[];
      /**
       * What the model reads beside the prompt and the user never sees, each
       * entry one block after the prompt as typed; absent as the engine raises it.
       *
       * A hook attaches on the way down: `next({ ...e, context: [...(e.context
       * ?? []), mine] })`, keeping which it likes; none empty, any length: past
       * 100,000 characters (200,000 together) the model reads a head and path.
       */
      context?: readonly string[];
      /**
       * The id of the model turn that was running when the prompt was submitted
       * (`turn.start`'s `turnId`): typed over that turn, or delivered into it.
       *
       * A queued delivery (a peer session's message) reaches the model inside a
       * running turn. Absent for a prompt submitted while the session was idle,
       * and for a plugin's own (`$.prompt.submit`), which runs once it is idle.
       */
      turnId?: string;
      /**
       * Whether the user asked the prompt to wait its turn (`chat:queueSubmit`,
       * `ctrl+x enter` by default): true for that submission, false otherwise.
       *
       * The engine queues every prompt typed mid-turn either way; the flag is
       * for hooks, so one that cancels the running turn on a plain Enter can
       * leave a waiting prompt alone. False for a prompt a plugin submitted.
       */
      wait: boolean;
      /**
       * Where the submission came from (PromptOrigin), set by the engine where
       * it was queued: the user's Enter, a notification, a peer, a plugin.
       *
       * `next(e)` passes it on as received; no hook may set one.
       */
      origin: PromptOrigin;
  };
```


## `PromptSubmitResult` (L8793)

```ts
  /**
   * What a `prompt.submit` hook returns and what `next(e)` resolves to: the
   * prompt that entered, `{ text, context?, origin? }`, or `{ drop: reason }`.
   *
   * `next(e)` resolves once the prompt entered the session and its turn
   * started, or it was queued behind the running one; not when the turn ends,
   * which is `turn.complete`. A hook answering without `next` enters nothing.
   */
  export type PromptSubmitResult = {
      /**
       * The prompt that entered; from core, the text that arrived at the
       * bottom. A rewrite passes it down, `next({ ...e, text })`.
       */
      text: string;
      /**
       * What entered beside the prompt for the model, never shown the user:
       * from core, the context that arrived (`e.context`).
       *
       * Each entry is one block after the prompt as typed. A hook attaches
       * context on the way down; one put here after `next` resolved is not
       * attached (the prompt had entered), and is logged.
       */
      context?: readonly string[];
      /**
       * Where the prompt entered from: from core, `e.origin` as received;
       * absent, the prompt is the user's own.
       *
       * A hook may put back the origin it received; it may not set another.
       */
      origin?: PromptOrigin;
      drop?: undefined;
  } | {
      /**
       * The prompt did not enter: a hook's refusal, answered without `next`,
       * or a settings hook's block beneath.
       *
       * The text is shown to the user as the reason. Returned after a `next(e)`
       * of the hook's was answered, a drop fails the hook: its `.catch` is
       * asked, or it is skipped by name and its last `next` stands.
       */
      drop: string;
      text?: undefined;
      context?: undefined;
      origin?: undefined;
  };
```


## `PromptComposeInput` (L8010)

```ts
  /**
   * The input of `prompt.compose`: the facts a system prompt is composed from,
   * each already resolved by the engine, at the moment it renders one.
   */
  export type PromptComposeInput = {
      /**
       * The id of the model the request is for; pinned, the field a matcher
       * narrows on.
       */
      model: string;
      /**
       * The model whose prompt is rendered: `model`, unless the engine renders
       * another model's prompt for it (a model it holds no prompt of its own for).
       */
      promptModel: string;
      /**
       * Where the session draws at this render, as `$.session.surfaces()`
       * answers: `terminal` first under the REPL; empty where nothing draws.
       */
      surfaces: readonly RenderSurface[];
      /**
       * The names of the tools the request offers the model; the engine's own
       * composition reads them against the session's, an unknown name ignored.
       */
      tools: readonly string[];
      /**
       * What the person chose in place of the default way of answering, and
       * whether it keeps the coding instructions; null for the default style.
       */
      outputStyle: {
          name: string;
          isKeepingCodingInstructions: boolean;
      } | null;
      traits: readonly PromptComposeTrait[];
  };
```


## `PromptComposeResult` (L8050)

```ts
  /**
   * What a `prompt.compose` hook returns: the sections of the system prompt,
   * in order, every `shared` one ahead of every `session` one.
   *
   * A section left out is not sent; a hook that never calls `next` answers
   * the whole list. The engine joins each side, places the cache boundary
   * between them and every cache marker itself.
   */
  export type PromptComposeResult = {
      sections: readonly PromptComposeSection[];
  };
```


## `PromptComposeSection` (L8071)

```ts
  /**
   * One section of the system prompt as `prompt.compose` answers it: a stable
   * id, the text the model reads, and the side of the cache boundary it is on.
   *
   * @example
   * const POLICY = { id: "acme:policy", text: "...", scope: "session" } as const
   */
  export type PromptComposeSection = {
      /**
       * What a hook above finds the section by, to replace, move or drop it;
       * never empty, and unique in one list.
       *
       * A plugin's own is `<plugin>:<name>`; a bare name is the engine's. The full
       * prompt opens `intro`, `system`, `doing_tasks`, `actions`, `tools`, `tone`;
       * the short one opens `lean_body` instead; `--bare`'s one section is `bare`.
       */
      id: string;
      /**
       * The section's text, sent as written; sections on one side of the
       * boundary are joined by a blank line, in the list's order.
       */
      text: string;
      /**
       * The side of the cache boundary the section is sent on; in one list
       * every `shared` section comes before every `session` one.
       *
       * A section added at the end of what `next(e)` answered is `session`.
       */
      scope: PromptComposeScope;
  };
```


## `PromptComposeScope` (L8062)

```ts
  /**
   * Which side of the prompt cache's boundary a section of the system prompt
   * sits on: `shared` before it, `session` after it.
   *
   * `shared` text reads the same for everyone on this build and model: the API
   * may cache it across organizations, and text that varies hits that cache for
   * nobody. `session` text varies. In a list every `shared` section comes first.
   */
  export type PromptComposeScope = 'shared' | 'session';
```


## `ToolCallInput` (L12329)

```ts
  /**
   * The input of `tool.call`: the tool, the id of this call, the tool's
   * arguments beside them (`e.command` for Bash), and `agentId` in a subagent.
   *
   * A union discriminated by `tool`: after `if (e.tool === "Bash")`, `e.command`
   * is a string and a rewrite is checked against Bash's schema. `tool`,
   * `tool_use_id` and `agentId` are reserved: a rewrite of any is refused.
   */
  export type ToolCallInput = ToolCallEnvelope & AgentLoop;
```


## `ToolCallEnvelope` (L12319)

```ts
  /**
   * The envelope the two tool events share: the tool, the id of this call, and
   * the tool's arguments spread beside them (`e.command` for Bash).
   *
   * A union discriminated by `tool`: after `if (e.tool === "Bash")`, `e.command`
   * is a string and a rewrite is checked against Bash's schema. The `e` of
   * `classic.PreToolUse` exactly; `tool.call`'s adds the loop (ToolCallInput).
   */
  export type ToolCallEnvelope = BuiltinToolCallInput | McpToolCallInput;
```


## `ToolCallResult` (L12365)

```ts
  /**
   * What a `tool.call` hook returns and what `next(e)` and `$.tool.call(input)`
   * resolve to: the tool's result (`{ result, context? }`) or `{ deny }`.
   *
   * From core the result is `{ ref, result, text }` or, when the tool reported
   * an error, `{ ref, result, text, isError }`, either with `isReadOnly` when
   * the tool held the input it ran read-only; `ref` names core's messages.
   *
   * @template Name the tool the call went to, typing `result` per built-in
   *   tool (BuiltinToolResults) once `e.tool` is narrowed; else `unknown`
   */
  export type ToolCallResult<Name extends string = string> = {
      /**
       * Refuses the call: the model receives the text as an error result.
       * Absent when the call was answered.
       *
       * Returned after `next(e)` was answered it undoes nothing: a tool that
       * ran has run, the deny is still the call's answer, and the debug log
       * names the plugin that denied.
       */
      deny: string;
      result?: undefined;
      context?: undefined;
      ref?: undefined;
      text?: undefined;
      isError?: undefined;
      isReadOnly?: undefined;
  } | {
      /**
       * The tool's output: from core the tool's record, typed per built-in
       * tool once `e.tool` and `isError` are narrowed; from a hook, its own.
       *
       * Core validates a hook's answer against the tool's output schema when
       * it has one, maps it for the model with the tool's own mapper, and
       * records it in the transcript as the tool's result. Absent on a deny.
       */
      result: ToolResultOf<Name>;
      /**
       * What the model reads after the tool's result and the user never
       * sees. From core, none.
       *
       * One reminder, as a PostToolUse hook's is, after the managed tier's
       * review; none on a plugin's own `$.tool.call`. Kept whole from `next`,
       * none empty, any length: past 100,000 (200,000 together) head + path.
       */
      context?: readonly string[];
      /**
       * Set by core on what `next(e)` resolves to: names the messages core
       * produced for the call (they stay on the host side).
       *
       * A hook that returns the object it got makes core use them verbatim.
       * Absent on a hook's own `{ result }` and on a deny.
       */
      ref?: number;
      /**
       * Set by core: the result as the model reads it (text blocks joined),
       * present whatever the tool, where `result`'s shape varies per tool.
       *
       * Absent on a hook's own `{ result }`.
       */
      text?: string;
      /**
       * Set by core, present only when the tool held the input it executed
       * read-only by its own check (the one its permissions use).
       *
       * It speaks for this call as run, rewrites included, not for calls it
       * causes (a subagent's tools raise their own `tool.call`); for an MCP
       * tool, its server's declaration. Bash `ls`: set; a hook's own: never.
       */
      isReadOnly?: true;
  // ... (trimmed)
```


## `TurnCompleteInput` (L12932)

```ts
  /**
   * The input of `turn.complete`: the assistant's final message of a turn, at
   * the moment the turn ends (where the turn's duration is reported).
   *
   * `reason` says why it ended; `refusal` exists on a refusal alone.
   */
  export type TurnCompleteInput = TurnCompleteFields & (TurnCompleteRefused | TurnCompleteUnrefused);
```


## `TurnCompleteResult` (L12956)

```ts
  /**
   * What a `turn.complete` hook returns and what `next(e)` resolves to:
   * `{ text }`; a text other than a main-loop answer's is shown beneath it.
   *
   * Core fills `usage` from `e.usage` when the turn had one; a hook above reads
   * it, and one that answers its own may leave it out.
   */
  export type TurnCompleteResult = {
      text: string;
      usage?: TurnUsage;
  };
```


## `CommandSpec` (L1837)

```ts
  /**
   * What `$.command.register` takes: the slash command this plugin serves.
   */
  export type CommandSpec = {
      /**
       * The command's name without the slash (letters, digits, `_`, `-`; up to
       * 64); the person runs it as `/<name>`.
       */
      name: string;
      /**
       * The one line the typeahead and `/help` show for it.
       */
      description: string;
      /**
       * The hint drawn dim after the name (`[name]`), when it takes arguments.
       */
      argumentHint?: string;
      /**
       * Set so that `/<name>` typed while a turn is in flight runs at once
       * instead of waiting for the turn to end, as it does when left out.
       *
       * Its `command.run` hook then runs while a turn may still be streaming and
       * must not assume the turn's state (what the transcript holds, whether a
       * tool is mid-call); its `{ text }` prints as an idle run's does.
       */
      immediate?: true;
  };
```


## `CommandRunInput` (L1743)

```ts
  /**
   * The input of `command.run`: one slash command about to run, the way the
   * person typed it (`/name args`), and where the run came from.
   */
  export type CommandRunInput = {
      /**
       * Names the command without its slash (`compact`, `hello`), aliases and
       * folds resolved; the key a matcher narrows on. A rewrite is refused.
       */
      command: string;
      /**
       * Everything after the name, as typed (`""` when nothing was); a hook
       * rewrites it with `next({ ...e, args })`.
       */
      args: string;
      /**
       * Where the run came from, in `prompt.submit`'s words (PromptOrigin):
       * the person's Enter (`composer`), the bridge, the SDK, or a plugin.
       *
       * A plugin's `$.command.run` reads `{ kind: 'plugin', name }`. `next(e)`
       * passes it on as received.
       */
      origin: PromptOrigin;
      /**
       * Where the command's answer will show (CommandPresentation): the
       * fullscreen layout or the main screen, and the terminal's width.
       *
       * Pinned: the engine stamps it, `next(e)` passes it on, a rewrite that
       * leaves it out keeps it and one that changes it is refused.
       */
      presentation: CommandPresentation;
  };
```


## `ToastOptions` (L12296)

```ts
  /**
   * Options of `$.ui.toast`.
   */
  export type ToastOptions = {
      /**
       * How long the line stays, in milliseconds; default 4000.
       */
      timeoutMs?: number;
  };
```


## `Timer` (L12280)

```ts
  /**
   * A pending timer from `$.clock.after` / `$.clock.every`.
   */
  export type Timer = {
      /**
       * Stops it; a stopped timer never fires again.
       */
      cancel: () => void;
  };
```


## `TimerCall` (L12291)

```ts
  /**
   * A timer on `$.clock` (`after`, `every`): `fn` runs after `ms` milliseconds,
   * once or until `cancel()`.
   */
  export type TimerCall = (ms: number, fn: () => void) => Timer;
```


## `$.ui` selected methods (L2283-2519)

```ts
          /**
           * Pins `text` as this plugin's status line under the prompt, beside the
           * engine's own pinned notices, until the next call replaces it.
           *
           * One per plugin; `undefined` removes it.
           *
           * @param text the line to keep on screen, its first 2000 characters drawn
           *   (10000 remotely); undefined clears it
           * @example
           * $.ui.status("thinking..."); return next(e)
           */
          status: (text: string | undefined) => void;

          /**
           * Shows `text` for a few seconds under the plugin's name: a small box on
           * the stack of plugin toasts over the transcript's top right corner.
           *
           * A click takes it off, the pointer over it holds it. Where the transcript
           * is printed into scrollback (nothing to float over) it is one line on the
           * notification bar. It leaves the transcript and the model untouched.
           *
           * @remarks While the pane shown was opened `holdToasts`, by any plugin, it
           *   waits undrawn, its timer not started; past 50 waiting, an older leaves.
           * @param text the line to show, its first 2000 characters drawn (10000
           *   remotely); an unpaired surrogate half in it is drawn as U+FFFD
           * @param options `timeoutMs`: how long it stays (default 4000)
           * @example
           * $.ui.toast(`turn took ${Math.round(e.durationMs / 1000)} s`)
           */
          toast: (text: string, options?: ToastOptions) => void;

          /**
           * Appends one line to the transcript, drawn like a system notice (dim;
           * not sent to the model), or with `{ to: "debug" }` to the debug log alone.
           *
           * A row of its own at the next frame, in logging order; a `-p` or SDK
           * host receives it as `ui_log`; the debug log has it either way, to 10000
           * characters. Raised as `ui.log`: a hook above may rewrite `e.to`.
           *
           * @param text the line's text, of any length: the terminal draws its
           *   first 2000 characters, a remote surface 10000
           * @param options `to`: `transcript` (the default) or `debug`
           * @example
           * $.ui.log(`prompt from ${e.origin.kind}: ${e.text.length} chars`)
           * @example
           * $.ui.log(`cache miss for ${e.tool_use_id}`, { to: "debug" })
           */
          log: (text: string, options?: UiLogOptions) => void;
```


## `$.clock` selected methods (L3358-3397)

```ts
          /**
           * Resolves milliseconds since the epoch, now.
           *
           * @example
           * const startedAt = await $.clock.now()
           */
          now: () => Promise<number>;

          /**
           * Calls `fn` once after `ms` milliseconds; `cancel()` before then stops it.
           *
           * One `clock.after` dispatch: `fn` runs when it resolves, and never when
           * a hook refuses it.
           */
          after: TimerCall;

          /**
           * Calls `fn` every `ms` milliseconds (at least 1) until `cancel()`.
           *
           * One `clock.every` dispatch per period: `fn` runs when it resolves and
           * the next period is asked; a refused period ends the interval.
           *
           * @example
           * const tick = $.clock.every(1000, () => $.ui.status("polling"))
           */
          every: TimerCall;
```


## `$.store` selected methods (L3283-3307)

```ts
          /**
           * Returns the value under `key`, or `undefined` when unset.
           *
           * @example
           * const count = Number((await $.store.get("count")) ?? 0) + 1
           */
          get: (key: string) => Promise<unknown>;

          /**
           * Sets `key` to `value`, which must be JSON data.
           *
           * `get` reads back `JSON.parse(JSON.stringify(value))`: a Date is its ISO
           * string, an `undefined` field is dropped, a Map or Set is `{}`. Rejects
           * a function, a cycle, or a store over 4 MiB of JSON text in all.
           */
          set: (key: string, value: unknown) => Promise<void>;

          /**
           * Removes `key` from the store.
           */
          delete: (key: string) => Promise<void>;
```


## `$.command` selected methods (L2988-3024)

```ts
          /**
           * Declares the slash command `/<name>` for this session, listed in the
           * typeahead from the next keystroke on.
           *
           * Serve it with a `command.run` hook on `{ command: "<name>" }` that
           * returns `{ text }`; a run no hook answers says so as its output.
           * Registering a name again replaces it; a built-in's name is refused.
           *
           * @param command `name`, `description` (what the menu shows),
           *   `argumentHint` (dim after the name), `immediate` (runs mid-turn)
           * @returns `{ command }`, the registered name
           * @example
           * await $.command.register({ name: "hello", description: "Says hi." })
           */
          register: (command: CommandSpec) => Promise<OpValueOf['command.register']>;
```


## `$.session` selected methods (L2670-2846)

```ts
          /**
           * Returns the directory the session runs in, absolute.
           */
          cwd: () => Promise<string>;
```


## `$.fs` selected methods (L3155-3275)

```ts
          /**
           * Writes `text` to a file, creating it and its directories as needed.
           *
           * @param path relative to the working directory, or absolute
           * @param text the whole new content
           */
          write: (path: string, text: string) => Promise<void>;
```


## `$.plugin` selected methods (L2269-2278)

```ts
          /**
           * From plugin.json; debug-log and `$.ui.log` lines carry it.
           */
          name: string;
```


# `claude-code/testing` kit

A test is `test(name, [options], async ($, on) => { ... })`. `$` is the engine's own: `$.prompt.compose(input)`, `$.prompt.submit(input)`, `$.tool.call(input)`, `$.turn.complete(input)`, `$.session.start(input)` dispatch the event through every loaded plugin (the plugin under test included). `on` registers hooks that sit beneath every plugin; beneath them the bottom hook throws naming its event, so a test that dispatches an event registers a bottom hook for it with `on` (for example `on('prompt.compose', () => ({ sections: [] }))`). `mock.clock(on)`, `mock.store(on, entries)` and `mock.env(on, vars)` answer those nouns from memory. `test(name, { options }, body)` gives the plugin its userConfig values.


## testing kit: `test` (L15447)

```ts
  /**
   * One test: it passes when its body returns or resolves, and fails when it
   * throws, rejects or outlasts its time (5000 ms, or `timeoutMs`).
   *
   * The body gets the engine's `$` and an `on` whose hooks sit beneath every
   * plugin; `plugins` load inline plugins beside the one under test. A failure
   * carries what the engine reported meanwhile: each hook it skipped, and why.
   *
   * @param name the test's name, led in its title by the describes around it
   * @param rest the body, `($, on) => ...`, or the options then the body
   */
  export const test: (name: string, ...rest: TestRest) => void;
```


## testing kit: `TestRest` (L15484)

```ts
  /**
   * What follows a test's name: its body, or its options then its body.
   */
  export type TestRest = readonly [body: TestBody] | readonly [options: TestOptions, body: TestBody];
```


## testing kit: `TestOptions` (L15464)

```ts
  /**
   * What `test` takes beside its name: the inline plugins it loads beside the
   * one under test, and how long it may run (5000 ms when not given).
   *
   * Also the plugin under test's `userConfig` values.
   */
  export type TestOptions = {
      plugins?: readonly Plugin[];
      timeoutMs?: number;
      /**
       * The plugin under test's `userConfig` values, standing as the ones
       * stored in settings.
       *
       * `register(on, options)` receives them as a load does: unlisted values
       * unset, defaults filled in, then validated, a bad required field failing
       * the load. Left out: the manifest's defaults. Inline plugins get none.
       *
       * @example
       * test('greets', { options: { greeting: 'yo' } }, body)
       */
      options?: PluginOptions;
  };
```


## testing kit: `TestBody` (L15456)

```ts
  /**
   * A test: the engine's `$`, and `on`, a plugin's registrar, whose hooks sit
   * beneath every plugin; beneath them the bottom hook throws, naming its event.
   *
   * The plugins load at the test's first call on `$`, so a test registers its
   * hooks before it, as a module registers its own in `register()`.
   */
  export type TestBody = ($: Engine, on: On) => unknown;
```


## testing kit: `Engine` (L14570)

```ts
  /**
   * What a test holds as `$`, the engine's own: every call on it is made as
   * the REPL, the query loop and the render sites make theirs, over every plugin.
   *
   * `next.origin` is the engine, the chain every plugin loaded. `$.ui.mount`
   * is a surface drawing an instance; `press`, `input` and `select` a person
   * acting on an element the test drew; `$.classic` the classic hook events.
   */
  export type Engine = {
      [N in keyof EventCalls]: N extends 'ui' ? EngineNoun<N> & EnginePress & EngineInput & EngineSelect & EngineMount : EngineNoun<N>;
  } & {
      classic: EngineClassic;
  };
```


## testing kit: `EngineCall` (L14580)

```ts
  /**
   * One call on the engine's `$`: the event's input whole, as an engine call
   * site passes it, to its result, or for a streaming event to its stream.
   */
  export type EngineCall<E extends EventName> = E extends StreamingEventName ? (e: Args<E>) => HookStream<Chunk<E>, ResultOf[E]> : (e: Args<E>) => Promise<ResultOf[E]>;
```


## testing kit: `EngineNoun` (L14652)

```ts
  /**
   * One noun of the engine's `$`: each of its events as the engine calls it,
   * `tool.call` and `ui.render` typed per tool and component, `ui.resolve` out.
   */
  export type EngineNoun<N extends keyof EventCalls> = {
      [V in EngineNounEvent<N>]: `${N}.${V}` extends 'tool.call' | 'ui.render' ? EventCalls[N][V] : EngineCall<`${N}.${V}` & EventName>;
  };
```


## testing kit: `Mock` (L14995)

```ts
  /**
   * The world beneath the plugins, mocked noun by noun: each member registers
   * hooks of the test's on `on`, visible where the test calls it.
   */
  export type Mock = {
      /**
       * Answers `$.clock` from a clock in memory that moves only when the test
       * moves it: `clock.now` reads it, and each wait is held.
       *
       * A held wait resolves when an advance crosses the time it is due, and is
       * dropped when its dispatch aborts; one held past a hook's budget (ten
       * seconds of real time) is let go, as a hook that overran.
       *
       * @param on the test's `on`
       * @param options where the clock starts (`now`, 0 when not given)
       * @returns the clock: its time, and the calls that move it
       */
      clock: (on: On, options?: MockClockOptions) => MockClock;
      /**
       * Answers `$.store` from a store in memory: `get`, `set`, `delete` and
       * `keys` over it, as the engine keeps a plugin's own.
       *
       * @param on the test's `on`
       * @param entries what the store holds at the start (nothing when not given)
       */
      store: (on: On, entries?: Readonly<Record<string, unknown>>) => void;
      /**
       * Answers `$.env.get` from a set of variables; one not listed is unset.
       *
       * @param on the test's `on`
       * @param variables the environment the plugins read
       */
      env: (on: On, variables: Readonly<Record<string, string>>) => void;
  };
```


## testing kit: `MockClock` (L15039)

```ts
  /**
   * The clock `mock.clock` hands back: the time its hooks answer, and the only
   * ways it moves.
   */
  export type MockClock = {
      /**
       * The time now, in milliseconds: what `$.clock.now()` resolves beneath the
       * plugins.
       *
       * @returns the time
       */
      now: () => number;
      /**
       * Moves the clock on, resolving each wait due on the way (`$.clock.sleep`,
       * `after`, `every`, this clock's `sleep`) in the order it comes due.
       *
       * The clock reads each wait's time as it resolves, and what one started
       * runs before the next resolves.
       *
       * @param ms how far to move, in milliseconds
       * @returns resolves once the clock is there and the event loop settled
       */
      advance: (ms: number) => Promise<void>;
      /**
       * Moves the clock to a time at or past now, as `advance` would.
       *
       * @param ms the time, in milliseconds
       * @returns resolves once the clock is there and the event loop settled
       */
      set: (ms: number) => Promise<void>;
      /**
       * Lets what is already under way run as far as it can without the clock
       * moving: every wait due now resolves and the event loop settles.
       *
       * The same as `advance(0)`; the name for the step between starting a
       * dispatch unawaited and looking at what it did.
       *
       * @returns resolves once the event loop settled, the time where it was
       */
      settle: () => Promise<void>;
      /**
       * Resolves once the clock has moved this far past now: how a hook of the
       * test's answers late.
       *
       * @param ms how far, in milliseconds
       * @returns resolves when an advance crosses that time
       */
      sleep: (ms: number) => Promise<void>;
  };
```


## `EventCalls` (L4616, head)

```ts
  /**
   * The engine's own events as calls on `$`, one signature each:
   * `$.<noun>.<event>(input)` resolves to its result, or to its stream.
   *
   * The engine raises its events through these same calls; a plugin's call
   * runs the same chain with the calling hook alone skipped. `input` may leave
   * out what the engine fills (`tool_use_id`, the parent agent).
   */
  export type EventCalls = {
      tool: {
          call: ToolCallOverloads;
          check: (input: ToolCheckArgs) => Promise<ToolCheckResult>;
          describe: (input: ToolDescribeInput) => Promise<ToolDescribeResult>;
      };
      command: {
          run: (input: CommandRunArgs) => Promise<CommandRunResult>;
          describe: (input: CommandDescribeInput) => Promise<CommandDescribeResult>;
      };
      config: {
          set: (input: ConfigSetArgs) => Promise<ConfigSetResult>;
          describe: (input: ConfigDescribeInput) => Promise<ConfigDescribeResult>;
      };
      prompt: {
          submit: (input: PromptSubmitArgs) => Promise<PromptSubmitResult>;
          fill: (input: PromptFillArgs) => Promise<PromptFillResult>;
          suggest: (input: PromptSuggestArgs) => Promise<PromptSuggestResult>;
          section: (input: PromptSectionInput) => Promise<PromptSectionResult>;
          context: (input: PromptContextInput) => Promise<PromptContextResult>;
          attachment: (input: PromptAttachmentInput) => Promise<PromptAttachmentResult>;
          mention: (input: PromptMentionInput) => Promise<PromptMentionResult>;
          compose: (input?: PromptComposeArgs) => Promise<PromptComposeResult>;
      };
      skill: {
          prompt: (input: SkillPromptInput) => Promise<SkillPromptResult>;
      };
      attribution: {
          text: (input: AttributionTextInput) => Promise<AttributionTextResult>;
      };
      agent: {
          offer: (input: AgentOfferInput) => Promise<AgentOfferResult>;
          spawn: (input: AgentSpawnArgs) => Promise<AgentSpawnResult>;
      };
      session: {
          start: (input: SessionStartInput) => Promise<SessionStartResult>;
          receive: (input: SessionReceiveInput) => Promise<SessionReceiveResult>;
          append: (input: SessionAppendInput) => Promise<SessionAppendResult>;
          send: (input: SessionSendArgs) => Promise<SessionSendResult>;
          compact: (input?: SessionCompactArgs) => Promise<SessionCompactResult>;
          attach: (input: SessionAttachInput) => Promise<SessionAttachResult>;
          detach: (input: SessionDetachInput) => Promise<SessionDetachResult>;
          measure: (input: SessionMeasureInput) => Promise<SessionMeasureResult>;
          end: (input: SessionEndInput) => Promise<SessionEndResult>;
      };
      telemetry: {
          log: (input: TelemetryLogArgs) => Promise<TelemetryLogResult>;
          mark: (input: TelemetryMarkInput) => Promise<TelemetryMarkResult>;
```


## `PromptComposeArgs` (L8004)

```ts
  /**
   * What a plugin passes `$.prompt.compose`: the facts it wants composed for,
   * each one it leaves out read off the session (its model, its tools).
   */
  export type PromptComposeArgs = Partial<PromptComposeInput>;
```


## `PromptSubmitArgs` (L8702)

```ts
  /**
   * `prompt.submit`'s input as a plugin's call takes it: `origin`, `turnId`
   * and `wait` are the engine's to set, `context` the hooks' to attach.
   *
   * `origin` is the calling plugin's name; `turnId` is the turn a prompt typed
   * mid-turn ran over; `wait` is false, as a plugin's prompt runs once idle.
   */
  export type PromptSubmitArgs = Omit<PromptSubmitInput, 'origin' | 'turnId' | 'wait' | 'context'> & {
      /**
       * Submit the text as the person's own words, read bare without the "The
       * <plugin> plugin sent a message" frame; absent means framed.
       *
       * The origin every hook sees stays `{ kind: 'plugin', name, asUser: true }`
       * and the transcript still names the plugin; `@file` mentions and pasted
       * images are not expanded for a plugin's prompt, `asUser` or not.
       *
       * @example
       * await $.prompt.submit({ text: 'what the person typed', asUser: true })
       */
      asUser?: true;
  };
```


## `ToolCallArgs` (L12309)

```ts
  /**
   * `tool.call`'s input as the call takes it: `tool_use_id` and `agentId` may
   * ride along (a hook passing its event's input on) and are dropped.
   *
   * The run gets its own id and runs in the session's loop.
   */
  export type ToolCallArgs = ToolCallEnvelope extends infer I ? I extends ToolCallEnvelope ? Omit<I, 'tool_use_id'> & ToolCallReserved<I['tool']> : never : never;
```


## `ToolNamed`: NOT FOUND
