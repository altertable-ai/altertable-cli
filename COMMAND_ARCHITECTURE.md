# Command Architecture

This diagram describes the current CLI command architecture and runtime data flow.

## Command Composition

```mermaid
flowchart TD
  cli["cli/src/cli.ts<br/>buildMainCommand()"]
  root["defineRootCommand()<br/>root args + top-level subCommands"]
  bind["defineAltertableCommand()<br/>binds CliRuntime + OutputSink"]

  cli --> root --> bind

  subgraph Commands["cli/src/commands/*"]
    api["apiCommand"]
    lakehouse["query / validate / append / upload / autocomplete"]
    configure["configure / profile / context / catalogs"]
    completion["completion"]
  end

  bind --> Commands

  subgraph Builders["operation-command-builders.ts"]
    group["defineGroupCommand()<br/>composition only"]
    http["defineHttpCommand()<br/>HTTP operation descriptor"]
    local["defineLocalCommand()<br/>local filesystem/config effect"]
    value["defineValueCommand()<br/>computed result effect"]
    output["defineOutputCommand()<br/>pre-rendered command output"]
  end

  Commands --> group
  Commands --> http
  Commands --> local
  Commands --> value
  Commands --> output

  buildersCore["defineOperationCommand()<br/>parse -> run plan -> interpret -> present"]

  group --> buildersCore
  http --> buildersCore
  local --> buildersCore
  value --> buildersCore
  output --> buildersCore

  catalog["operation-catalog.ts<br/>capabilities, planes, mutates, output"]
  buildersCore -. registers id metadata .-> catalog
```

## Runtime Data Flow

```mermaid
sequenceDiagram
  participant User
  participant Bootstrap as cli.ts bootstrap()
  participant Delegation as command-delegation.ts
  participant Citty as citty runCommand()
  participant Command as defineOperationCommand()
  participant Effects as operation-effect.ts
  participant Transport as operation-transport.ts
  participant HTTP as http.ts
  participant Output as OutputSink / writeCommandOutput()

  User->>Bootstrap: altertable ... raw argv
  Bootstrap->>Delegation: normalizeApiInvocatorRawArgs(rawArgs, ROOT_ARGS)
  Delegation-->>Bootstrap: rawArgs with -- inserted for API passthrough endpoints
  Bootstrap->>Bootstrap: parse early global flags and refresh CliRuntime
  Bootstrap->>Citty: runCommand(main, rawArgs)
  Citty->>Command: run(CommandRunContext)
  Command->>Command: create OperationContext(runtime, sink, execution)
  Command->>Command: parse(args, rawArgs) -> input
  Command->>Effects: run(input, context) -> OperationPlan
  Effects->>Effects: interpret OperationEffect

  alt http or http-stream effect
    Effects->>Transport: sendOperationHttp(request, execution)
    Transport->>Transport: resolve plane endpoint + auth header
    Transport->>HTTP: httpSend / httpSendStream
    HTTP-->>Transport: body or stream
    Transport-->>Effects: transport result
    Effects->>Effects: decode body/stream -> domain result
  else local effect
    Effects->>Effects: run local function with OperationContext
  else output effect
    Effects->>Output: writeCommandOutput(CommandOutputMode, sink)
  else value effect
    Effects-->>Command: return computed result
  end

  Effects-->>Command: result
  Command->>Command: present(result, context, input)
  Command->>Output: writeCommandOutput(...) or sink.write*
  Output-->>User: stdout / stderr
```

## API Delegation Flow

```mermaid
flowchart LR
  raw["raw argv"]
  rootFlags["valueFlagsFor(ROOT_ARGS)"]
  findApi["findFirstPositionalToken(raw argv, root value flags)"]
  isApi{"token is api?"}
  apiArgs["scan args after api<br/>using API_VALUE_FLAGS"]
  separator{"already has --?"}
  reserved{"operand is reserved?<br/>spec/routes/HTTP method"}
  insert["insert -- before endpoint operand"]
  unchanged["return raw argv unchanged"]
  normalized["return normalized argv"]

  raw --> rootFlags --> findApi --> isApi
  isApi -- no --> unchanged
  isApi -- yes --> separator
  separator -- yes --> unchanged
  separator -- no --> apiArgs --> reserved
  reserved -- yes --> unchanged
  reserved -- no --> insert --> normalized
```

## Naming Boundaries

| Name | Layer | Meaning |
| --- | --- | --- |
| `parse` | command definition | Convert Citty args/raw args into command input data. |
| `run` | operation command core | Build an `OperationPlan`; does not directly own presentation. |
| `operation` | HTTP command builder | Descriptor that turns typed input into HTTP effects. |
| `local` | local command builder | Filesystem/config/local side effect. |
| `value` | effect layer | Already-computed result with no transport or local side effect. |
| `present` | command definition | Convert domain result into command output. |
| `OutputSink` | runtime | Writes stdout/stderr in JSON, raw, human, or metadata channels. |

`defineOutputCommand` currently uses `value` for its public callback even though that callback returns a `CommandOutputMode`. The cleaner public name is `render`; internal `value` effects can stay as the interpreter primitive.
