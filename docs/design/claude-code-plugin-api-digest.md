# Claude Code function-hook plugin API: digest for implementers

Extracted 2026-10-06 from the engine-written declaration file of Claude Code 2.1.290 (`claude-code.d.ts`, ~16k lines). EARLY ACCESS API: the declaration file is the authority; this digest keeps only what kokoro-mods generates code against. Line numbers refer to that file. Doc comments are kept because they state the contract (what a hook may rewrite, what is pinned).

Mod layout (from the plugin-authoring skill): `.claude-plugin/plugin.json` {name, version, description, [types]}, `hooks/hooks.json` {"modules": ["./register.ts"]}, `hooks/register.ts` exporting `register: Register`. Optional `types/index.d.ts` declares `interface PluginState` under the mod's name for `$.state` values. Tests: `*.test.ts` importing from `'claude-code/testing'`, run with `claude plugin test <dir>`; `claude plugin validate --strict <dir>` checks the manifest and the module's source. A hook is `($, e, next)`; a guard is written `on(...).catch(($, e, next) => next.called ? next(e) : { deny: 'why' })`. The module runs with no DOM and no Node; everything outside comes through `$`. State for drawings lives in `$.state` via `atom/read/update` (module variables are lost on hot reload); values that must survive the session go to `$.store`.


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


## `PaneOpenArgs` (L7148)

```ts
  /**
   * The argument of `$.ui.open`: which pane, its title, whether it asks the
   * person's keyboard, its dialog manners, its size: rows inline, columns docked.
   *
   * An open answering the person's input (a command or prompt they entered, a
   * press) is placed at any width; one the plugin makes on its own waits
   * undrawn below 144 terminal columns, 110 once they asked for that id (in
   * this session or an earlier one, until they close the pane by hand), and
   * the call resolves `{ isPlaced: false, reason }` (UiOpenResult) saying so.
   */
  export type PaneOpenArgs = {
      /**
       * Names the pane: 1-64 of letters, digits, `_` and `-`. One pane per id:
       * opening an open id delivers the new title, never a second instance.
       *
       * Pinned at the hooks: `next(e)` passes it on; the title and focus rewrite.
       */
      id: string;
      /**
       * The pane's tab while more than one pane is open (with one, no title is
       * drawn), and the `title` its hook sees; the id when omitted.
       *
       * An unpaired surrogate half (a `.slice()` through an emoji) is drawn as
       * U+FFFD; a control character is refused.
       */
      title?: string;
      /**
       * A request, not a grant: the surface focuses (and raises) the pane only
       * while the prompt has the keys over an empty composer.
       *
       * An element of the band or a pane the person holds, text in the
       * composer, a dialog or a survey each refuse it: the pane opens without
       * the keyboard.
       */
      focus?: true;
      /**
       * While the pane holds the keyboard, the key that hands it back (Escape)
       * also closes it as the person's close does: `ui.close`, origin `person`.
       *
       * So does Escape at an idle, empty prompt once the prompt has the keys
       * again (the person typed, or `focus` was refused); over text, a turn, a
       * dialog, a footer selection, a viewed agent or a prompt mode it is theirs.
       *
       * @remarks A hook may refuse that close and keep it open. Left out, Escape
       *   returns the keys and the pane stays. Each open sets it anew, as a title.
       */
      closeOnEscape?: true;
      /**
       * While the pane is the one shown the surface holds every transient toast:
       * each other plugin's `$.ui.toast` and the engine's own, as this plugin's.
       *
       * The toast stack is not drawn, its timers waiting; the notification line
       * queues all but the engine's standing warnings, and one up as the pane opens
       * may end unseen. After, the stack draws its newest few, the line one by one.
       *
       * @remarks For a dialog the person answers and leaves, not a pane that stays.
       *   Left out, toasts show. Every open sets it; a `ui.open` hook may drop it.
       */
      holdToasts?: true;
      /**
       * The body rows the pane's content wants while seated inline above the
       * prompt: it opens that tall, up to what the layout spares, not a third.
       *
       * A request, not a grant: a size the person dragged or keyed the block
       * to wins, this session's or a kept one, and the dock ignores it. A
       * positive whole number; left out, a third. Each open sets it anew.
       */
      rows?: number;
      /**
       * The body columns the pane's content wants while docked beside a
  // ... (trimmed)
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


## `ModelCompleteRequest` (L6000)

```ts
  /**
   * What `$.model.complete` takes.
   */
  export type ModelCompleteRequest = {
      /**
       * An alias (`haiku`) or a full model id; resolved and allowlist-checked like
       * a `--model` value.
       */
      model: string;
      /**
       * The one user message.
       *
       * The result always says what happened: the reply's text and usage when
       * the model answered, else a `reason` (an API error with its status, a
       * reply with no text, or the call cut short).
       */
      prompt: string;
      /**
       * Precedes the completion as its system prompt, after the CLI's identity
       * block. Default none.
       */
      system?: string;
      /**
       * The reply's token cap: any positive integer up to what one reply can
       * hold, the model's own output limit or 64000, whichever is lower.
       *
       * Default 1024. The reply comes back whole, not streamed, and a provider
       * ends such a request at ten minutes, hence the 64000. One past the limit
       * is refused, naming it.
       */
      maxTokens?: number;
      /**
       * How hard the model thinks about it (ModelEffort): `low` for a cheap
       * label, `max` for a hard judgment. Default: the model's own.
       *
       * Sent as the request's effort where the model takes one and dropped
       * where it does not, as the session's own requests do; a value outside
       * the five levels is refused.
       *
       * @example
       * await $.model.complete({ model: "haiku", prompt, effort: "low" })
       */
      effort?: ModelEffort;
      /**
       * How long the whole call may take, in milliseconds, before it resolves
       * `aborted` and the request is abandoned; default none.
       *
       * A `$` call's time never counts against the calling hook's budget, so this
       * is how a hook bounds the completion itself, by the clock. A positive whole
       * number, held to what a timer holds (2147483647); anything else is refused.
       *
       * @example
       * await $.model.complete({ model: "haiku", prompt, timeoutMs: 8000 })
       */
      timeoutMs?: number;
  };
```


## `StateRef` (L11719)

```ts
  /**
   * A typed reference to one named value: the owning plugin and the key, both
   * literals, and for a StateFamily key the member's `id`.
   *
   * Written once as a constant and passed to `$.state.get` and `$.state.set`;
   * `plugin` and `key` must be literals in source so `claude plugin validate`
   * lists what a module reads and writes. Only `id` may be computed.
   *
   * @example
   * const workers = { plugin: "swarm", key: "workers" } as const
   */
  export type StateRef<P extends keyof PluginState & string, K extends keyof PluginState[P] & string> = StateName<P, K> & (PluginState[P][K] extends StateFamily<unknown> ? Readonly<Required<Pick<StateAddress, 'id'>>> : Readonly<Partial<Record<'id', undefined>>>);
```


## `RenderComponent` (L9037)

```ts
  /**
   * Everything `ui.render` can draw: one name per component that has a render
   * site; a matcher narrows on it.
   *
   * The permission dialog is drawn by the engine alone, since its answer
   * authorises an action; a plugin adds context with `$.ui.notice`. `Pane` is
   * the one component whose instances a plugin opens (`$.ui.open`).
   */
  export type RenderComponent = 'AskUserQuestion' | 'UserMessage' | 'AssistantMessage' | 'ToolUse' | 'ToolResult' | 'ToolGroup' | 'ToolProgress' | 'CommandOutput' | 'Spinner' | 'TurnDuration' | 'InfoNotice' | 'SessionMode' | 'PromptHint' | 'AbovePrompt' | 'Pane';
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

          /**
           * Opens a pane, a framed region the surface places and this plugin draws
           * by hooking `ui.render` for `{ component: "Pane" }`; says if it is drawn.
           *
           * One per id (an open id retitles; a `ui.open` hook may refuse). Asked,
           * the person's command, prompt or press behind it (not `focus`), it is
           * placed at any width; unasked, from 144 columns, 110 for one once asked.
           *
           * @remarks Below that it waits undrawn (`$.ui.panes()`: `isPlaced` false)
           *   until they open it or the terminal widens; a `-p` run places all.
           * @param pane `id` (1-64 of letters, digits, `_`, `-`), `title`, `focus`,
           *   `closeOnEscape` and `holdToasts` (a dialog), `rows` / `columns` wanted
           * @returns `{ isPlaced: true }` once drawn (or retitled), else `{ isPlaced:
           *   false, reason }` (UiOpenResult); `dock` or `inline` is on `Pane` props
           * @example
           * await $.ui.open({ id: "clock", title: "Clock" })
           * @example
           * await $.ui.open({ id: "ask", focus: true, closeOnEscape: true, rows: 9 })
           * @example
           * const opened = await $.ui.open({ id: "clock" })
           * if (!opened.isPlaced) $.ui.toast("clock: widen the terminal to see it")
           */
          open: (pane: PaneOpenArgs) => Promise<UiOpenResult>;

          /**
           * The elements of the surface `e` is drawn on (Elements[e.surface]): a
           * frozen table of constructors, the JSX tags a render hook draws with.
           *
           * A read, not a dispatch: the engine ran `ui.resolve` (the other hooks,
           * then core) at load, per surface and component. Narrowed `e.surface`:
           * that table exactly; unnarrowed: the union, so shared names type-check.
           *
           * @param e this hook's own `ui.render` argument (its surface and
           *          component pick the table)
           * @returns the surface's frozen element table (`Elements[e.surface]`)
           * @example
           * const { Box, Text } = $.ui.resolve(e)
           * return <Box>{await next(e)}<Text dimColor>done</Text></Box>
           */
          resolve: <E extends ResolveInput>(e: E) => Elements[E['surface']];

          /**
           * Re-runs an event whose results the engine caches: `ui.render` draws the
           * instances this plugin may draw again; the others drop the cached answers.
           *
           * A render hook whose state changed (a countdown) calls it to redraw: ten a
           * second at most, thirty in the terminal for its shown pane, expanded band
           * and prompt hint (sooner calls fold); a cached answer: dropped next turn.
           *
           * @remarks For `ui.render`, the instances this plugin's matchers on it may
           *   select: one naming no `requestId`, every instance of its component.
           * @param event `ui.render`, or a cached-answer event: `prompt.section`,
           *   `prompt.context`, `prompt.attachment`, `tool/command/config.describe`
           */
          invalidate: (event: InvalidatableEventName) => void;
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
           * Resolves after `ms` milliseconds; rejects at once when `signal` aborts.
           *
           * The wait is the hook's own time and its budget runs on through it, as
           * through no other `$` call: a `turn.step` generator that polls with it
           * pays every sleep out of its one budget (`next.budget.remainingMs`).
           *
           * @param ms how long, in milliseconds
           * @param options `signal`: ends the wait early with a rejection (pass
           *   `next.signal` so a hook's wait ends with its dispatch)
           * @example
           * await $.clock.sleep(500, { signal: next.signal })
           */
          sleep: (ms: number, options?: SleepOptions) => Promise<void>;

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


## `$.state` selected methods (L3316-3349)

```ts
          /**
           * Resolves the value under `ref` and the version it stands at; a value
           * never written is `undefined` at version 0.
           *
           * Every `get` of one dispatch reads one moment, whatever is written
           * meanwhile. `plugin` and `key` must be literals in source (`claude plugin
           * validate` lists them); only a family member's `id` may be computed.
           *
           * @param ref `{ plugin, key }` as the owner's contract declares it in
           *   PluginState, with `id` for a StateFamily key
           * @returns `{ value, version }`
           * @example
           * const workers = { plugin: "swarm", key: "workers" } as const
           * const { value = [] } = await $.state.get(workers)
           */
          get: <P extends keyof PluginState & string, K extends keyof PluginState[P] & string>(ref: StateRef<P, K>) => Promise<StateRead<StateValue<P, K>>>;

          /**
           * Writes `value` under `ref`, which must be this plugin's own; the sites
           * that read it while drawing are drawn again, at the redraw rate.
           *
           * Refused while a `ui.render` hook draws (write from `onPress` or another
           * event) and for another plugin's value (hook its `state.set` and rewrite
           * `e.value`). JSON data, as `$.store.set` takes; never `undefined`.
           *
           * @param ref `{ plugin, key }`, with `id` for a StateFamily key
           * @param value the value, of the type the contract declares
           * @param options `ifVersion`: write only while it stands at that version
           * @returns `{ isSet, version }`; `isSet` false when `ifVersion` missed
           * @example
           * await $.state.set(count, held.value + 1, { ifVersion: held.version })
           */
          set: <P extends keyof PluginState & string, K extends keyof PluginState[P] & string>(ref: StateRef<P, K>, value: StateValue<P, K>, options?: StateSetOptions) => Promise<StateSetResult>;
```


## `$.model` selected methods (L2523-2589)

```ts
          /**
           * Runs one text completion through the session's own API client and
           * resolves a result: the reply's text and cost, or why there is no text.
           *
           * No tools, no history, no system prompt beyond the CLI's identity block
           * and `request.system`; ModelCompleteRequest says the rest. Only a request
           * the engine refuses to send (a blocked model, a bad cap) rejects.
           *
           * @param request the model (an alias such as `haiku`, or a full id
           *                resolved like `--model`), prompt, cap, effort, time limit
           * @param options `signal`: the plugin's own AbortSignal; aborting it
           *   cuts the call while it runs, which then resolves `aborted`
           * @returns the reply (`isAnswered`, `text`, `usage`), else the `reason`:
           *          `api-error` with `status` and `error`, `empty-reply`, `aborted`
           * @example
           * const r = await $.model.complete({ model: "haiku", prompt, effort })
           * @example
           * // one handler starts it, a later one cancels it while it runs
           * let stop = new AbortController()
           * const start = async () => {
           *   stop = new AbortController()
           *   const r = await $.model.complete(ask, { signal: stop.signal })
           *   if (!r.isAnswered && r.reason === "aborted") $.ui.log("cancelled")
           * }
           * const cancel = () => stop.abort()
           */
          complete: (request: ModelCompleteRequest, options?: ModelCompleteOptions) => Promise<ModelCompleteResult>;
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

          /**
           * Runs a slash command as if the person typed `/command args`: the
           * event `command.run`, queued and run once the session is idle.
           *
           * It runs through every hook but the calling one with `e.origin`
           * `{ kind: 'plugin', name }`, its lines in the transcript. Rejects an
           * unknown name, and inside a hook the turn is waiting on.
           *
           * @example
           * const { text } = await $.command.run({ command: "status" })
           */
          run: EventCalls['command']['run'];
```


## `$.session` selected methods (L2670-2846)

```ts
          /**
           * Appends a row to a conversation of the session: the event
           * `session.append`, the engine's own call for every row it keeps.
           *
           * A user-role row the person does not see as typed or a notice, of text
           * blocks alone in this release (else refused with the reason): listed at
           * once. `{ deny: reason }` when a plugin above refused it, nothing stored.
           *
           * @example
           * await $.session.append({ message: { type: "user", content: [note] } })
           */
          append: (args: SessionAppendArgs) => Promise<SessionAppendResult>;

          /**
           * Returns the directory the session runs in, absolute.
           */
          cwd: () => Promise<string>;

          /**
           * Returns the transcript so far, one SessionMessage per user or assistant
           * message; progress rows, `$.ui.log` lines and notices are not messages.
           *
           * With `{ agentId }`, one of this session's agents' instead (a subagent, a
           * fork, a teammate in this process): what the session saved for it joined
           * with what the engine holds. With `{ as: "api" }`, either as ApiMessage.
           *
           * @param args `agentId`, the id `tool.call`, `turn.complete` and `$.agent
           *             .list()` carry; `as: "api"` for ApiMessage; hooks see both
           * @returns the newest 4096 entries, `{ role, text, toolUses }` (a user
           *          message may add `toolResults`; a `toolUses` entry adds `result`
           *          and `text` once answered, an Agent tool use its `agentId`), or
           *          with `as` `{ role, content }`, blocks intact, at most 4096
           *          opening on a user message; for an `agentId` the session
           *          cannot read, `{ deny }` (SessionMessagesDeny), never main
           * @example
           * const last = (await $.session.messages()).at(-1)
           * @example
           * const request = await $.session.messages({ as: "api" })
           * await $.http.fetch(AUDIT_URL, {
           *   method: "POST",
           *   body: JSON.stringify({ session: await $.session.id(), request }),
           * })
           * @example
           * on("turn.complete", async ($, e, next) => {
           *   if (e.agentId === undefined) return next(e)
           *   const found = await $.session.messages({ agentId: e.agentId })
           *   if (!("deny" in found)) $.ui.log(`${found.length} messages`)
           *   return next(e)
           * })
           */
          messages: SessionMessagesCall;

          /**
           * Returns every surface the session draws on, each once: `terminal` under
           * the REPL first, then the remote ones in the order they attached.
           *
           * A session may draw on several at once (a terminal and two phones):
           * clients attach (`session.attach`) and detach, and a render hook still
           * reads `e.surface` per ask. Empty in a plain -p run; never rejects.
           *
           * @example
           * const inApp = (await $.session.surfaces()).some(s => s !== "terminal")
           */
          surfaces: () => Promise<readonly RenderSurface[]>;
```


## `$.fs` selected methods (L3155-3275)

```ts
          /**
           * Reads a file and returns its text, or with `{ as: "bytes" }` its bytes
           * as `{ base64 }`.
           *
           * Rejects when missing, or over 4 MiB, which bounds what one read copies
           * into the plugin's environment. A file the plugin ships is under
           * `$.plugin.root`.
           *
           * @param path relative to the working directory, or absolute
           * @param options `as`: `"text"` (the default) or `"bytes"`
           * @returns the file's text, or `{ base64 }`
           * @example
           * const readme = await $.fs.read("README.md")
           * @example
           * const { base64 } = await $.fs.read(
           *   `${$.plugin.root}/hooks/weights.bin`, { as: "bytes" })
           * const weights = Uint8Array.fromBase64(base64)
           */
          read: FsReadCall;

          /**
           * Writes `text` to a file, creating it and its directories as needed.
           *
           * @param path relative to the working directory, or absolute
           * @param text the whole new content
           */
          write: (path: string, text: string) => Promise<void>;

          /**
           * Returns `{ kind, size, mtimeMs, isLink }` of the path: what it leads to,
           * and whether it is itself a symbolic link. Rejects when missing.
           *
           * With `{ resolve: true }` also `realPath`, where the path lands, absent
           * when it leads nowhere; a guard matches it and denies without it, since a
           * spelling it cannot resolve (`~`, a file not there yet) the tool may open.
           *
           * @param path relative to the working directory, or absolute
           * @param options `resolve`: also answer `realPath` (one more file system
           *                call)
           * @returns the stat, `realPath` with it when asked and resolvable; rejects
           *          `ENOENT` for a missing path
           * @example
           * // ROOT was resolved the same way and SEP is its separator; an
           * // allow-list under it is the robust guard, a deny-list on spellings
           * // only best effort (a hard link or a case alias keeps its own)
           * on("tool.call", { tool: "Read" }, async ($, e, next) => {
           *   const stat = await $.fs.stat(e.file_path, { resolve: true })
           *     .catch(() => undefined)
           *   const real = stat?.realPath
           *   const isInside = real !== undefined && real.startsWith(ROOT + SEP)
           *   return isInside ? next(e) : { deny: "outside the project" }
           * })
           * @example
           * // a Write may name a file not there yet: `placed` answers where the
           * // path lands or undefined, and the guard denies on undefined or
           * // outside ROOT. Unplaceable by spelling first, with no file system
           * // call (drive-relative `D:x`, a `\\` or `//` network or device path,
           * // a name that is empty, ".", ".." or itself `C:...`); then the file
           * // if it stats; else its folder, cut after the last separator and
           * // keeping it so a drive or share root stays that root, plus the name
           * const placed = async (path) => {
           *   const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
           *   const name = path.slice(cut + 1)
           *   const isPlaceable = !/^[A-Za-z]:(?![\\/])/.test(path) &&
           *     !/^[\\/][\\/]/.test(path) && !/^[A-Za-z]:/.test(name) &&
           *     name !== "" && name !== "." && name !== ".."
           *   if (!isPlaceable) return undefined
           *   const own = await $.fs.stat(path, { resolve: true })
           *     .catch(() => undefined)
           *   if (own) return own.realPath
           *   const folder = cut < 0 ? "." : path.slice(0, cut + 1)
           *   const dir = await $.fs.stat(folder, { resolve: true })
           *     .catch(() => undefined)
           *   return dir?.realPath === undefined ? undefined
           *     : `${dir.realPath.replace(/[\\/]$/, "")}${SEP}${name}`
           * }
           * const real = await placed(e.file_path)
           * const isInside = real !== undefined && real.startsWith(ROOT + SEP)
           * return isInside ? next(e) : { deny: "cannot place it, or outside" }
           */
          stat: (path: string, options?: FsStatOptions) => Promise<FsStat>;

          /**
           * Lists a directory by name: `{ name, kind, size, mtimeMs, isLink }` per
           * entry, each entry as it stands.
           *
           * A symbolic link is `other` with `isLink`; `size` and `mtimeMs` are a
           * regular file's own and 0 for every other kind (`$.fs.stat` has those).
           *
           * @param path the directory's path; absent, the working directory
           * @returns the entries, `{ name, kind, size, mtimeMs, isLink }` each
           * @example
           * const logs = await $.fs.list("logs")
           * const newest = [...logs].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
           */
          list: (path?: string) => Promise<FsEntry[]>;
```


## `$.process` selected methods (L3430-3486)

```ts
          /**
           * Runs a command on the host by its argument vector (no shell) and
           * resolves `{ exitCode, stdout, stderr }` once it exits, any exit code.
           *
           * One shot: the whole output is read, so a background process left
           * writing holds the call until the timeout. Rejects when the command
           * cannot start or is still running then. Git runs with repo hooks off.
           *
           * @param argv the command and its arguments, `argv[0]` the executable
           * @param init `{ cwd, env, stdin, timeoutMs }` (cwd the session's by
           *             default; timeout 30 s by default, ten minutes at most)
           * @returns `{ exitCode, stdout, stderr }`, each stream's first 4194304
           *          bytes (`isStdoutTruncated`, `isStderrTruncated` say when cut)
           * @example
           * const { exitCode, stdout } = await $.process.run(["git", "status"])
           */
          run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>;
```


## `$.plugin` selected methods (L2269-2278)

```ts
          /**
           * From plugin.json; debug-log and `$.ui.log` lines carry it.
           */
          name: string;

          /**
           * The plugin's directory (the one holding plugin.json), absolute.
           */
          root: string;
```


## `atom` (L14261)

```ts
  /**
   * A named value with its initial: `read` answers the initial while nothing
   * is written, so never `undefined`. Pure; runs in the plugin's environment.
   *
   * @example
   * import { atom, read, update } from "claude-code"
   * const count = atom({ plugin: "counter", key: "count" } as const, 0)
   */
  export const atom: AtomFunction

  /**
   * A value computed from atoms and references, cached by their versions.
   *
   * @example
   * const busy = derive([workers], list => list.filter(w => w.isBusy).length)
   */
  export const derive: DeriveFunction

  /**
   * A family's member for the instance being drawn, keyed by `e.requestId`.
   *
   * @example
   * const open = await read($, memberOf(isOpen, e))
   */
  export const memberOf: MemberOfFunction

  /**
   * Reads an atom, a derived value or a reference through `$.state.get`;
```


## `derive` (L14269)

```ts
  /**
   * A value computed from atoms and references, cached by their versions.
   *
   * @example
   * const busy = derive([workers], list => list.filter(w => w.isBusy).length)
   */
  export const derive: DeriveFunction

  /**
   * A family's member for the instance being drawn, keyed by `e.requestId`.
   *
   * @example
   * const open = await read($, memberOf(isOpen, e))
   */
  export const memberOf: MemberOfFunction

  /**
   * Reads an atom, a derived value or a reference through `$.state.get`;
```


## `read` (L14286)

```ts
  /**
   * Reads an atom, a derived value or a reference through `$.state.get`;
   * while a `ui.render` hook draws, that subscribes the drawing.
   *
   * @example
   * const n = await read($, count)
   */
  export const read: ReadFunction

  /**
   * Reads, applies `fn` in the plugin's environment, writes with
   * `ifVersion`, and tries again on a miss: what a handler closure calls.
   *
   * @example
   * <Button key="more" onPress={() => update($, count, n => n + 1)} />
```


## `update` (L14295)

```ts
  /**
   * Reads, applies `fn` in the plugin's environment, writes with
   * `ifVersion`, and tries again on a miss: what a handler closure calls.
   *
   * @example
   * <Button key="more" onPress={() => update($, count, n => n + 1)} />
   */
  export const update: UpdateFunction

  /**
   * The globals of a hooks module's environment: these and no others (no DOM,
   * no Node). No code generation either: `eval` and `new Function` over a
   * string throw, and there is no `WebAssembly` (deliberately; a module that
   * needs compiled code runs it in a process of its own through `$.process.run`).
   * A surface module's environment (Client) has the same globals and a
   * `console`; neither has timers (a hooks module waits on `$.clock`, a
   * surface module on `surface.every`).
   */
  global {
    /**
     * The JSX factory (classic runtime, `@jsx h`; the engine prepends the
     * pragma): a plain-data element from a string tag or a component.
     *
     * JSX compiles to bare `h(...)` calls resolved by name, so a module (hooks or
     * surface) never declares, imports or takes as a parameter anything named
     * `h` or `Fragment` where it writes JSX, and carries no `@jsx` pragma of its
     * own: either silently points its JSX away from this factory, and a
     * `<Client>` tag written under another factory is not found when the
     * module's surface modules are read off its source.
     */
  // ... (trimmed)
```


## `BoxProps` (L862)

```ts
  /**
   * The props of `Box`: the layout, position, margin, padding and border props
   * of Ink's Box a tree may set, and the two of hover.
   */
  export type BoxProps = {
      /**
       * Makes the Box a hover scope: while the pointer is anywhere over it, its
       * own `hover` and that of every element beneath it apply.
       *
       * A nested Box with a `key` of its own scopes what is beneath it, a placed
       * card outside its rows included. A key a sibling Box already took, or one
       * that is no plain string, names no scope: hovers beneath it stay inert.
       */
      key?: string;
      /**
       * Style overrides applied by the surface while the pointer is over the
       * nearest keyed `Box`, this one included, or, given a `scope`, its group.
       *
       * No hook runs and nothing crosses to the plugin. To reveal on hover, draw
       * the Box `display: "none"` with `hover: { display: "flex" }` in a visible
       * keyed Box or under a `scope`; on a `position: "absolute"` Box, no reflow.
       */
      hover?: BoxHoverProps;
      /**
       * `"absolute"` leaves the flow, as in CSS: placed against its parent by
       * the offsets, no room among its siblings, painted over those before it.
       *
       * So showing or moving it (a hover may) moves nothing; the pointer on it is
  // ... (trimmed)
```


## `TextProps` (L12228)

```ts
  /**
   * The props of `Text`: the color and style props of Ink's Text a tree may
   * set. Colors are a theme key or a raw color.
   */
  export type TextProps = {
      /**
       * Style overrides applied by the surface while the pointer is over the
       * nearest enclosing keyed `Box`, or, given a `scope`, over its group.
       *
       * No hook runs and nothing crosses to the plugin. Refused outside a keyed
       * Box unless it names a `scope`.
       */
      hover?: TextHoverProps;
      color?: Color;
      backgroundColor?: Color;
      dimColor?: boolean;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      inverse?: boolean;
      wrap?: 'wrap' | 'end' | 'middle' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end';
  };
```


## `ButtonProps` (L1021)

```ts
  /**
   * The props of `Button`, every surface's pressable leaf: an address, a
   * label, the closure a press runs, and the label styles a hover overrides.
   *
   * The terminal draws `[ label ]` (when `plain`, `1: label` or the label
   * alone), a desktop a native button; a click, a `hotkey`, the chord for its
   * `action`, or Enter under the focus raises `ui.press`, its bottom `onPress`.
   */
  export type ButtonProps = {
      /**
       * The element's address: `e.element` at `ui.press`, what a matcher names.
       * Defaults to the label.
       */
      key?: string;
      /**
       * The text drawn on the button; or the one string child.
       */
      label?: string;
      /**
       * One digit (`"1"`) or one lowercase letter (`"w"`) that presses it while
       * the plugin's site holds the focus; anything else is refused.
       *
       * Its site holds it after ctrl+x tab, a click or `open({ focus })`: the band
       * or its `Pane`; never the composer, save that a bare digit in an empty one
       * answers a band Button (a survey). Shift+w is `"w"`; two clash, later wins.
       */
      hotkey?: string;
      /**
  // ... (trimmed)
```


## `claude-code/testing` kit (L14434, head)

```ts
declare module 'claude-code/testing' {
  import type { Args } from 'claude-code';
  import type { Chunk } from 'claude-code';
  import type { ClassicEventName } from 'claude-code';
  import type { ClassicEventOf } from 'claude-code';
  import type { ClassicResultOf } from 'claude-code';
  import type { ClientKeyEvent } from 'claude-code';
  import type { ClientPointerEvent } from 'claude-code';
  import type { Elements } from 'claude-code';
  import type { EventCalls } from 'claude-code';
  import type { EventName } from 'claude-code';
  import type { HookStream } from 'claude-code';
  import type { JsonValue } from 'claude-code';
  import type { On } from 'claude-code';
  import type { PluginOptions } from 'claude-code';
  import type { PressedLink } from 'claude-code';
  import type { Register } from 'claude-code';
  import type { RenderComponent } from 'claude-code';
  import type { RenderElement } from 'claude-code';
  import type { RenderPropsOf } from 'claude-code';
  import type { RenderSurface } from 'claude-code';
  import type { RenderViewport } from 'claude-code';
  import type { ResultOf } from 'claude-code';
  import type { StreamingEventName } from 'claude-code';
  import type { Tier } from 'claude-code';
  import type { UiInputArgument } from 'claude-code';
  import type { UiInputResult } from 'claude-code';
  import type { UiPressResult } from 'claude-code';
  import type { UiSelectResult } from 'claude-code';

  /**
   * A value that matches by a rule inside `toEqual` and its kin
   * (`expect.any`, `expect.objectContaining`), known by its text in a failure.
   */
  export type AsymmetricMatcher = {
      readonly text: string;
  };

  /**
   * The same checks on what a promise received settles with, each resolving
   * once the promise has settled and the check passed.
   */
  export type AsyncMatchers = {
      [K in keyof Matchers]: (...args: Parameters<Matchers[K]>) => Promise<void>;
  };

  /**
   * A classic hook event the engine raises on its own, by its own name
   * (`SessionStart`, `Stop`): all but `PreToolUse`, which rides `tool.call`.
   *
   * `$.tool.call` raises `classic.PreToolUse` as a session does: beneath every
   * plugin's `tool.call` hook and above the test's own, which a deny never
   * reaches (the call resolves errored, the reason its `text`).
   */
  export type ClassicEvent = Exclude<ClassicEventName, 'classic.PreToolUse'> extends `classic.${infer E}` ? E : never;

  /**
   * What `$.classic.<Event>` takes: the event's own fields as its hook sees
   * them on `e`, less what the engine stamps at every call site.
   *
   * `hook_event_name` is the call's; `session_id`, `transcript_path` and
   * `cwd` are the session's unless the test gives them (the test session's
   * id, `''` for no local transcript, the plugin's folder).
   */
  export type ClassicFields<E extends ClassicEvent> = Omit<ClassicEventOf[`classic.${E}`], 'hook_event_name' | 'session_id' | 'transcript_path' | 'cwd'> & Partial<Pick<ClassicEventOf[`classic.${E}`], 'session_id' | 'transcript_path' | 'cwd'>>;

  /**
   * Which `Client` of a mounted drawing an act or a read means, by the `key`
   * its element carries; optional while the drawing holds exactly one.
   */
  export type ClientScope = {
      in?: string;
  };

  /**
   * A class, as `toThrow`, `toBeInstanceOf` and `expect.any` take it.
   */
  export type Constructor = abstract new (...args: never[]) => unknown;

  /**
   * A group of tests: its name leads the title of each test declared inside,
   * and its body runs at once, while the file loads.
   *
   * @param name the group's name
   * @param body declares the group's tests
   */
  export const describe: (name: string, body: () => void) => void;

  /**
   * The element each surface-dependent act of a mounted drawing reaches: a
   * handle carries the act only where the surface's table has the element.
   *
   * `input` needs `Input` and `select` needs `Select` (every surface but
   * mobile today); `key`, `pointer`, `post`, `advance` and `resize` reach a
   * `Client` (terminal and desktop today). The rest need nothing but a tree.
   */
  export type ElementOfAct = {
      input: 'Input';
      select: 'Select';
      key: 'Client';
      pointer: 'Client';
      post: 'Client';
      advance: 'Client';
      resize: 'Client';
  };

  /**
   * What a mounted drawing's `find` and `findAll` match an element on, every
   * field given at once: its tag, its `key`, and the text it shows.
   *
   * `text` matches the element's whole shown text (string children, a Button
   * or Link's label, a Markdown's text, a Code's source, an Input's value):
   * a string by inclusion, a RegExp by test.
   *
   * @example
   * await ui.findAll({ type: 'Text', text: /overdue/, in: 'board' })
   */
  export type ElementQuery = {
      type?: string;
      key?: string;
      text?: string | RegExp;
      /**
       * Searches what this `Client`'s surface module drew (by the `Client`'s
       * key) instead of the plugin's own tree.
       */
      in?: string;
  };

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

  /**
   * One call on the engine's `$`: the event's input whole, as an engine call
   * site passes it, to its result, or for a streaming event to its stream.
   */
  export type EngineCall<E extends EventName> = E extends StreamingEventName ? (e: Args<E>) => HookStream<Chunk<E>, ResultOf[E]> : (e: Args<E>) => Promise<ResultOf[E]>;

  /**
   * The classic (settings) hook events as the engine raises them: each a call
```
