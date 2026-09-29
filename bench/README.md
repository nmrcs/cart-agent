# bench

Ten buyers, two ways to build their cart, the same model and the same shop.

- **code** is the harness as it ships: the model reads the message, ranks a
  shortlist and words the reply; code filters the catalog, fits the budget
  and prices every proposal through the backend.
- **model** is the same model with the shop's API as tools (`search_products`,
  `get_product`, `propose_cart`, `put_in_cart`) and the harness's rules as
  instructions. The shop prices each proposal it makes and returns the total;
  choosing items, fitting the budget and counting what is left are the
  model's.

## The buyers

Each persona in `src/personas.ts` has a hidden profile: age, budget, the date
the gift must arrive by, interests, what the recipient already has, and how
many gifts the buyer wants. Each is built around a trap in the catalog: an
item just over budget, one out of stock, one that arrives a day late, a toy
that needs batteries the budget does not cover.

The buyer is a script, not a model, so its mistakes do not mix with the
agent's. It answers only what it is asked, from the persona's facts. Once
there is a proposal it plays the persona's moves in order: change a
quantity, drop an item, ask for more with the money left, ask for a
discount, agree.

## What is checked

Against the catalog as the backend has it, never against what the agent
says:

- a proposal over budget (unless the buyer asked for more of an item);
- a product that does not exist, is out of stock, is for another age,
  arrives too late or is already owned;
- items added without the buyer asking;
- a dollar amount in the reply that is no price, total, remainder or budget,
  and a stated total or remainder that is wrong;
- a reply saying something went into the cart when nothing did, and a reply
  offering more when the buyer did not ask;
- a proposal before the age, budget, date and interests are known;
- whether each edit left the proposal as the buyer asked;
- model calls, tokens and seconds per conversation.

## Run

The shop, the harness and LM Studio running as in the main README, then:

```bash
npm run bench                                  # 10 personas x 2 variants x 3 runs
npm run bench -- --variants code --reps 1      # one variant, one run
npm run bench -- --personas camera-friend,cheap-12 # some personas
npm run bench -- --summarize runs/<time>       # summary of a stopped run
npm run bench -- --summarize runs/<time> --recheck   # rerun the checks on recorded turns
```

Each run writes `runs/<time>/dialogs.jsonl` (every turn, the proposal after
it and what each check found) and `runs/<time>/summary.md`.

`runs/2026-09-27/` is the last recorded run: 6 personas, each once per
variant.
