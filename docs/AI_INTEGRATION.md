# AI Integration Strategy — EVE Trade Advisor

## Architecture

```
Express Backend (K8s)                    Ollama (GPU Server - minisforum-c)
┌─────────────────────┐                  ┌──────────────────────┐
│ 1. Fetch ESI data   │                  │                      │
│ 2. Calculate margins │──── HTTP ──────→│  Qwen 2.5 (GGUF)    │
│ 3. Build context    │                  │  OpenAI-compat API   │
│ 4. Send to Ollama   │←── response ────│                      │
│ 5. Return to client │                  └──────────────────────┘
└─────────────────────┘
```

Key principle: **backend does the math, LLM does the reasoning.**
Never ask the LLM to calculate margins — feed it pre-calculated results and ask it to explain, prioritize, and answer questions.

---

## Phase 1 — System Prompt + Context Injection (Start Here)

### System Prompt

```
You are an EVE Online trade advisor integrated into an industry tracking application.
You receive pre-calculated market data as structured tables. Your job is to:

1. EXPLAIN why certain trades are profitable (market dynamics, hub characteristics, volume patterns)
2. PRIORITIZE which trades to execute given capital constraints, cargo space, and risk tolerance
3. WARN about risks (low volume, price manipulation, gank routes, market saturation)
4. ANSWER natural language questions about the data

NEVER recalculate margins or fees — the numbers you receive are already correct.
Always account for practical concerns: cargo m³, route safety, how long items sit on market.

Trade Types:
- Type A (Buy Order Arbitrage): Place buy orders at source hub, wait to fill, transport and sell elsewhere. Higher margins, slower, capital locked up.
- Type B (Instant Relist): Buy from sell orders at source hub, transport immediately, relist as sell orders at destination. Lower margins, instant, predictable.

Major Trade Hubs:
- Jita (The Forge) — largest hub, highest volume, tightest margins
- Dodixie (Sinq Laison) — second largest, good margins on niche items
- Amarr (Domain) — third largest, strong for Amarr faction gear
- Rens (Heimatar) — Minmatar hub, lower volume but good margins
- Hek (Metropolis) — smallest major hub, can have best margins but slow sales

Fee Structure (before skills):
- Broker fee: 3.0% (reduced by Broker Relations + Advanced Broker Relations + standings)
- Sales tax: 3.6% (reduced by Accounting skill, 0.6% per level)

When recommending trades, always mention:
- Net profit per unit (after all fees)
- ROI percentage
- Estimated daily volume at destination
- Cargo volume (m³) for transport planning
- Any risks or concerns
```

### Context Template

The backend builds this context string from pre-calculated data and injects it into the user message:

```
=== CURRENT MARKET DATA ===
Source Hub: Jita 4-4
Your Capital: 500,000,000 ISK
Your Cargo: 62,500 m³ (Occator)
Trade Type: B (instant relist)
Accounting Level: 4 (2.4% sales tax)
Broker Relations Level: 4 (1.8% broker fee)

=== TOP OPPORTUNITIES (pre-calculated) ===
| Item | Buy (Jita) | Sell (Dodixie) | Net Profit | ROI% | Vol/Day | Cargo m³ |
|------|-----------|----------------|------------|------|---------|----------|
| Crane | 128,000,000 | 151,900,000 | 13,452,000 | 10.5% | 3 | 50,000 |
| Prorator | 131,800,000 | 149,200,000 | 8,120,000 | 6.2% | 5 | 50,000 |
| ...

=== USER QUESTION ===
{user's natural language question here}
```

### Backend Implementation Pattern

```javascript
// services/aiService.js

const SYSTEM_PROMPT = `...`; // as above

async function askTradeAdvisor(userQuestion, marketContext) {
  const response = await axios.post(
    `${process.env.OLLAMA_URL}/v1/chat/completions`,
    {
      model: process.env.OLLAMA_MODEL || 'qwen2.5:32b-instruct-q4_K_M',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${marketContext}\n\n${userQuestion}` }
      ],
      temperature: 0.3,  // low temp for factual analysis
      max_tokens: 1024
    },
    { timeout: 120000 }  // LLM inference can be slow
  );
  return response.data.choices[0].message.content;
}
```

### Frontend Pattern

Simple chat-style interface on the Trading page:
- Text input for natural language questions
- Pre-filled suggestions: "Where should I sell my Cranes?", "Best 10 items to relist from Jita with 500M budget?"
- Responses rendered as markdown
- Market data context built automatically from current filters/selections

---

## Phase 2 — RAG (Retrieval-Augmented Generation)

Add EVE-specific knowledge that the base model may not know or may hallucinate about.

### Knowledge sources to index:
- **Item metadata**: categories, market groups, blueprint requirements
- **Trade route data**: jump counts between hubs, lowsec/highsec paths, gank hotspots
- **Historical patterns**: your past trades and outcomes (from wallet transactions)
- **Market dynamics**: which items are commonly manipulated, seasonal trends
- **Player knowledge**: e.g. "Rens is dying as a hub", "Pochven items only sell in Jita"

### Implementation:
- Store knowledge chunks in SQLite with embeddings (or simple keyword search)
- On each query, retrieve relevant chunks and inject into context
- Libraries: could use a lightweight embedding model alongside Ollama, or just use keyword/category matching (simpler, often sufficient)

### When to do this:
When Phase 1 responses show gaps in EVE-specific knowledge (e.g., wrong assumptions about trade routes, not knowing item categories, hallucinating game mechanics).

---

## Phase 3 — QLoRA Fine-Tuning

Train the model on EVE trading specifically using your own trade history.

### Prerequisites:
- 100-500 training examples (instruction/input/output triplets)
- RTX 3090 (24GB VRAM is enough for QLoRA)
- Base model: Qwen 2.5 14B (more practical to fine-tune than 32B)

### Training data format (Alpaca-style):

```json
[
  {
    "instruction": "Analyze these Type B trade opportunities from Jita and recommend the best trades for a 500M budget.",
    "input": "| Item | Buy Jita | Sell Dodixie | Net Profit | ROI% | Vol/Day |\n| Crane | 128M | 151M | 13.4M | 10.5% | 3 |\n| Prorator | 131M | 149M | 8.1M | 6.2% | 5 |",
    "output": "I recommend the Prorator as your primary trade despite the lower per-unit profit. Here's why:\n\n1. **Higher daily volume (5 vs 3)** — your Prorators will sell faster, reducing capital lock-up time\n2. **Lower unit cost** — you can carry more with 500M budget\n3. **6.2% ROI is still excellent** for a Type B instant trade\n\nFor the Crane, the 10.5% ROI is tempting but only 3 sell per day in Dodixie. If one is already listed below your price, you could wait 2-3 days to sell.\n\n**Suggested allocation:** 3x Prorator (395M) + 1x Crane (128M) = 523M. Slightly over budget — drop to 2x Prorator if needed."
  }
]
```

### How to collect training data:
1. Use the app with Phase 1 (system prompt) for a few weeks
2. When the AI gives a good response, save the input/output pair
3. When it gives a bad response, write the correct response and save that
4. Export these as training data
5. Could add a thumbs up/down button in the chat UI to flag good/bad responses

### Fine-tuning tools:

```bash
# Unsloth — fastest QLoRA on consumer GPUs
pip install unsloth

# Training script (simplified)
from unsloth import FastLanguageModel
model, tokenizer = FastLanguageModel.from_pretrained("Qwen/Qwen2.5-14B-Instruct", load_in_4bit=True)
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=16)
# ... train on your dataset ...
model.save_pretrained_merged("eve-trade-advisor", tokenizer, save_method="merged_16bit")
# Convert to GGUF, load in Ollama via custom Modelfile
```

### Timeline:
- Collect data: 2-4 weeks of normal usage with Phase 1
- Fine-tune: 1-4 hours on RTX 3090
- Test and iterate: ongoing

### Loading fine-tuned model in Ollama:

```dockerfile
# Modelfile
FROM ./eve-trade-advisor-q4_K_M.gguf
SYSTEM "You are an EVE Online trade advisor..."
PARAMETER temperature 0.3
PARAMETER num_ctx 8192
```

```bash
ollama create eve-trade-advisor -f Modelfile
```

---

## Summary

| Phase | Effort | When | What it gives you |
|---|---|---|---|
| 1. System prompt + context | Hours | Now | 70% — working AI advisor with good trade analysis |
| 2. RAG knowledge injection | Days | When Phase 1 has knowledge gaps | 85% — EVE-specific knowledge without hallucination |
| 3. QLoRA fine-tune | Weeks (data collection) | When you have trade history | 95% — model speaks EVE natively, understands your trading style |

Start with Phase 1. It's the highest value for lowest effort, and it generates the training data you'll need for Phase 3.
