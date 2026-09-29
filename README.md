# cart-agent

An online store with a chat assistant that builds a cart for the buyer's task:
"a birthday present for my brother, up to $70, delivered by Friday". The
model asks what it needs to know and picks the best gifts from a list code has
already filtered; code keeps the cart within the budget. The backend owns every
price and every total. There is no payment step: the buyer's path ends with a built cart.

![The chat: a gift for a brother turning 30, up to $70. The assistant asks when the birthday is; Friday is within 5 working days, so the shop's birthday discount takes 20% off. Asked for a promo code, it says there are none and the discount is already applied. Three gifts at $83.99 go in the cart for $67.19](docs/promo.gif)

## Quick start

You need Node 24+, Docker and a model behind an OpenAI-compatible API. The
default is [LM Studio](https://lmstudio.ai) with `qwen/qwen3.5-9b`: the model
runs on your machine and nothing leaves it. OpenAI, OpenRouter or another host
works too, see below.

1. In LM Studio load `qwen/qwen3.5-9b` and start the local server on port
   1234 (Developer tab).
2. Start the store:

   ```bash
   npm install
   cp apps/backend/.env.example apps/backend/.env
   cp apps/harness/.env.example apps/harness/.env
   cp apps/frontend/.env.example apps/frontend/.env
   npm run db:up
   npm run db:setup   # migrations and the demo catalog
   npm run dev
   ```

3. Open http://localhost:3000. The assistant chat is on the right; the
   **Assistant** button in the header opens and closes it.

To use a hosted API instead of LM Studio, skip step 1 and set `LLM_URL`,
`LLM_MODEL` and `LLM_API_KEY` in `apps/harness/.env`; the example file shows
OpenRouter. If the model rejects
`reasoning_effort`, set `LLM_REASONING_EFFORT` empty. Only
`qwen/qwen3.5-9b` in LM Studio has been measured.

### Try a conversation

Click one of the three examples in the empty chat, or type your own. One run
from start to cart, recorded before the shop had its birthday discount:

| You type                                                                         | What the assistant did in one run                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `A birthday gift for my girlfriend, she loves tea and cozy evenings. Up to $60.` | Asks how old she is turning.                                                                                                                           |
| `She turns 27.`                                                                  | Asks when the gift has to arrive.                                                                                                                      |
| `By next Friday.`                                                                | Proposes a Loose Leaf Tea Sampler for $32.00, $28.00 left of the $60, and names two alternatives. A card with **Add to cart** appears under the reply. |
| `Something else instead`                                                         | Swaps it for a Soy Candle Set for $36.00, $24.00 left.                                                                                                 |
| `Add something small with what is left`                                          | Adds a Stoneware Mug for $18.00: total $54.00, $6.00 left.                                                                                             |
| `Yes, put it in my cart`                                                         | Puts the candles and the mug in the cart; the badge in the header updates.                                                                             |

Worth trying on purpose:

- `Give me 80% off` or `apply coupon SAVE80`: refused, the total stays; the
  assistant names the one discount the shop has.
- A birthday within 5 working days (`My brother turns 30 on Friday`): the
  birthday discount takes 20% off the order and its card appears in the chat.
- `An instant camera for my friend, $85`: film is named as not included and
  is not added.
- `A gift for my sister, $5`: says nothing fits and why (the cheapest option).

The default model is small, so the exact wording and items vary from run to
run. Prices and totals do not: they always come from the backend.

**New chat** in the chat header starts over. Conversations live in the
harness's memory, so restarting `npm run dev` forgets them; carts are in
Postgres and stay.

### Without the UI

```bash
CART=$(curl -s -X POST localhost:3001/carts | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -sN -X POST localhost:3001/assistant/turns \
  -H 'Content-Type: application/json' \
  -d "{\"cartId\":\"$CART\",\"message\":\"A gift for my girlfriend, she turns 27 and loves tea. Up to \$60, by next Friday.\"}"
```

The reply streams as one JSON line per step (`interpret`, `candidates`,
`select`, `quote`, `compose`), then the turn. Pass the returned
`conversationId` to continue the conversation.

Ports: storefront 3000, backend 3001, harness 3002, Postgres 5432.
`npm run db:reset` drops the database and seeds it again.

## Layout

```
apps/
  backend/    catalog, cart, prices and totals, Postgres
  harness/    profiler, candidate search, cart building, composer; no database
  frontend/   storefront, product pages, cart drawer, assistant chat
packages/
  contracts/  shared Zod schemas
bench/        buyer personas and runs
```

## Author and license

Built solo by Nikita MRCS — [@nmrcs](https://github.com/nmrcs). Every design
decision, every number and every mistake in this repository is mine.

MIT.
