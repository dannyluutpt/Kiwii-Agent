-- Seed plan config. Mirrors PLAN_SEED in src/plans.ts; edit both together.
INSERT OR REPLACE INTO `plans` (`id`, `name_vi`, `name_en`, `price_vnd`, `price_usd`, `credits`, `chat_daily_messages`, `chat_monthly_messages`, `chat_monthly_tokens`, `chat_context_tokens`, `parallel_limit`, `active`) VALUES
  ('free', 'Miễn phí', 'Free', 0, 0, 0, 30, NULL, NULL, 32000, 0, 1),
  ('starter', 'Starter', 'Starter', 299000, 11.7, 180, NULL, 3500, 25000000, 64000, 2, 1),
  ('plus', 'Plus', 'Plus', 949000, 37.2, 750, NULL, 11000, 80000000, 128000, 4, 1),
  ('ultra', 'Ultra', 'Ultra', 2490000, 97.7, 2300, NULL, 29000, 200000000, 256000, 8, 1);
