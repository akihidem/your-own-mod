# Recipe catalog summary (generated from src/catalog/index.mjs)

| id | template | title (en) | summary (en) | params | counts |
|---|---|---|---|---|---|
| `lead-with-answer` | compose-rule | Lead with the answer | Start with the answer and keep the necessary explanation brief. | max_lines, max_chars | long_answers |
| `accept-typos-as-intent` | compose-rule | Read past typos | Read intended meaning without pointing out spelling differences. |  |  |
| `response-language` | compose-rule | Response language | Respond in the requested language. | language |  |
| `one-next-step` | compose-rule | One next step | Split large tasks and finish with one concrete next action. |  |  |
| `receive-only-fragments` | submit-detector | Acknowledge short fragments | Briefly acknowledge a configured short utterance without advice. | max_chars, phrases | detected |
| `respect-stop-signals` | submit-detector | Respect stop signals | Acknowledge a stop signal and end without another task or question. | phrases | detected |
| `no-psych-framing` | compose-rule | Follow stated preferences | Follow stated working preferences without interpreting the person. |  |  |
| `publish-guard` | publish-guard (safety) | Ask before publishing | Block matching Bash publish commands until a timed grant is set; other tools and scripts that publish internally are outside this guard. | allow_minutes, patterns | denied, allowed |
| `quiet-confirmations` | compose-rule | Keep confirmations focused | Avoid repeated routine confirmations while keeping the stated gates. |  |  |
| `offer-options` | compose-rule | Compare options | Compare several options before recommending a choice. | min, max |  |
| `plain-language` | compose-rule | Plain language | Use plain language and explain necessary technical terms. |  |  |
| `expert-role-with-evidence` | compose-rule | Expert perspective with evidence | Use the requested expert perspective with evidence and ways to test claims. |  |  |
| `trace-offers` | compose-rule | Offer a place to record | Suggest a concrete place to record decisions or progress. |  |  |
| `running-indicator` | running-indicator | Show ongoing work | Show elapsed time and tool activity, with a notice for long turns. | long_turn_seconds | long_turns, suppressed |
| `block-ahead-warning` | compose-rule | Warn about upcoming gates | Explain upcoming authentication and approval steps before reaching them. |  |  |
| `session-resume-brief` | resume-brief | Brief session history | On resuming, show only days since the last session and its turn count. |  | resumed |
| `focus-timer` | focus-timer | Break reminder | Offer timed break reminders only after activity since the previous tick. | interval_minutes | ticks, suppressed |

Event names: allowed, denied, detected, long_answers, long_turns, resumed, suppressed, ticks
