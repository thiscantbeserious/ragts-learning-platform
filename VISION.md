# Vision

How learning works — from first principles to the asynchronous refinement loop that Erika builds.

---

## Step 1: The Human Loop

Humans learn through failure and repetition. The critical ingredient isn't the failure — it's the reflection between attempts. Without understanding *why* something failed, repetition is just noise.

```mermaid
%%{ init: { 'flowchart': { 'curve': 'basis', 'nodeSpacing': 40, 'rankSpacing': 60 } } }%%
flowchart TD
    Try([Try]) --> Success([Success])
    Try --> Fail([Fail])
    Fail -->|repeat without learning| Try
    Fail --> Reflect([Reflect])
    Fail --> GiveUp([Move on])
    Reflect --> Adjust([Adjust])
    Adjust --> Try
```

This loop is slow, expensive, and irreplaceable. It's how we build intuition.

---

## Step 2: How Machines Compress This

AI compresses the same cycle — millions of attempts, no reflection needed. Audiovisual models, reinforcement learning, massive training corpora. Fast, tireless, increasingly autonomous.

```mermaid
%%{ init: { 'flowchart': { 'curve': 'basis' } } }%%
graph TD
    Training[(Training · RLHF · Data)] -.->|pre-trained| T
    T([Try]) --> F([Fail])
    F --> T
    T --> S([Success])
```

The reflection step disappears. **Speed replaces understanding.**

---

## Step 3: The Context Problem

To compensate, the industry adds retrieval layers — RAG, memory files, auto-injected snippets. More context, **but not better context**.

```mermaid
graph TD
    Agent([Agent]) --> Action([Act])
    Action --> Result([Result])

    RAG[(RAG)] -.-> Agent
    Docs[(Docs)] -.-> Agent
    Memory[(Memory)] -.-> Agent
    Logs[(Logs)] -.-> Agent

    Result --> Agent
```

Every source is another fork in the road. The agent gets more directions, not better ones.

---

## Step 4: The Current State of Things

This is how agentic coding works today. The human writes a prompt. The agent grabs whatever context it can find — memory files it wrote itself, retrieval snippets matched by keyword similarity, instruction files. None of this is curated by a human. The agent decides what to load, and it decides the way a search engine does: by surface-level relevance, without understanding what actually mattered last time.

Then it works — sometimes with the human watching and approving, sometimes on full auto-accept. Either way, the human is either blocked waiting, or absent entirely.

```mermaid
graph TD
    subgraph Session["Synchronous · Blocking"]
        Human([Human]) -->|writes prompt| Agent([Agent])
        Agent --> Work([Works])
        Work -->|maybe approve?| Human
        Human -->|correct| Agent
        Work --> Done([Session ends])
    end

    subgraph Static["Context"]
        direction LR
        Memory[(Memory files)] ~~~ RAG[(RAG)]
        Instructions[(AGENTS.md)] ~~~ FS[(Filesystem)]
    end

    Static -.->|largely uncurated| Agent
    Done -.->|sometimes stores| Memory
```

The context the agent works with is **not chosen by the human**. Memory files, RAG, instructions, filesystem — the agent decides what to load, matched by surface-level relevance, not by intent. A critical architectural decision gets the same weight as a stale TODO.

The session itself is a **synchronous, blocking loop**. If the human is involved, they sit and wait. If they're not, the agent runs unsupervised. Either way, corrections stay trapped in the session. Next time, the agent loads the same unchosen context, maybe overwrites its own memory, and the cycle repeats.

Nothing the human learned carries over. And if you're on a team, none of it helps your colleagues either.

---

## Step 5: The Asynchronous Refinement Loop

This is what Erika builds.

Right now, agents write their own context. MEMORY.md, AGENTS.md, CLAUDE.md — these files exist because agents need somewhere to store what happened. They're useful, but they're never curated by a human. The agent writes them, the agent reads them. Humans rarely touch them, and when they do it's ad-hoc.

Instead of requiring humans to supervise agents in real-time, Erika captures every session and makes it reviewable after the fact. Humans browse what happened, understand why, mark what mattered, and annotate what should have gone differently — on their own time, at their own pace.

Those curated insights feed back to agents as structured context. Not raw logs. Not keyword-matched snippets. Not files the agent wrote to itself. Human-validated, intent-aware context that tells agents not just what happened, but what *should* have happened — delivered however the agent can consume it.

```mermaid
%%{ init: { 'flowchart': { 'nodeSpacing': 50, 'rankSpacing': 60 } } }%%
flowchart TD
    subgraph Session["Synchronous · Sessions"]
        Human(["👤 Human"]) -->|prompt| Agent(["🤖 Agent"])
        Agent -->|works| Human
    end

    Session -->|raw output| Adapter

    subgraph Adapter["🔌 Adapter"]
        direction LR
        Asciicast["🖥️ asciicast"] ~~~ JSONL["📄 JSONL"] ~~~ OTel["📡 OTel"]
    end

    Adapter -->|normalized sessions| Platform

    subgraph Platform["Erika Platform"]
        direction LR
        Store([Store]) --> Curate([Curate]) --> Share([Share])
    end

    subgraph Team["Asynchronous Learning"]
        H1(["👤 Human 1"])
        H2(["👤 Human 2"])
        A1(["🤖 Agent"])
    end

    S1@{ shape: brace, label: '"Wrong pattern here"' }
    S2@{ shape: brace, label: '"Ah I understand now"' }
    S3@{ shape: brace, label: '"Pattern matches issue #42"' }
    H1 -.- S1
    H2 -.- S2
    A1 -.- S3

    Platform <--> Team

    Curated[("🗄️ Curated Context<br/>RAG · MCP · AGENTS.md")]
    Platform -->|writes curated| Curated
    Curated -.->|structured context| Agent

    style Adapter stroke-dasharray: 5 5, fill:#f5f5f5, stroke:#999, color:#333
```

Each cycle sharpens both sides. Humans browse sessions, curate what matters, share with the team — on their own time, not blocking the agent. Agents contribute too: flagging patterns, linking related sessions, suggesting refinements. Both feed back into the platform asynchronously. Curated insights flow back as structured context, replacing the self-written, uncurated files from Step 4.

The loop is **asynchronous** — humans and agents refine at their own pace. It's **compounding** — every curation pass improves the next session. And it's **collaborative** — the whole team contributes, humans and agents alike.

The loop doesn't replace human judgment. It scales it — and lets agents help.
