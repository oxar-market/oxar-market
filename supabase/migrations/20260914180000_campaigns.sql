-- Заявка на кампанию: покупатель говорит, какая кампания ему нужна, а не
-- выбирает из витрины.
--
-- Продавцов на витрине пока нет, и подставлять выдуманных нельзя. Но выбор
-- покупателю и не нужен - ему нужен результат: сколько размещений, какого
-- типа, у аккаунтов какого размера, на какой срок и в какой бюджет. Все числа
-- в такой заявке его собственные, поэтому её можно собрать, ничего не
-- подделывая, и собрать до того, как появится хоть один листинг.
--
-- Побочная польза важнее основной: названный живым покупателем бюджет - это
-- первая цена за место, у которой есть источник. Из запрошенных цен продавцов
-- такой цифры не получить, пока продавцов нет.

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- тип места; список тот же, что в packages/core/src/placements.ts
  placement text not null check (placement in (
    'avatar', 'banner', 'name_suffix', 'bio_text', 'bio_link',
    'location', 'pinned_post'
  )),

  -- сколько размещений нужно: одно - частный случай кампании
  placements_wanted integer not null check (placements_wanted between 1 and 1000),

  -- порог аудитории, необязателен: покупателю может быть всё равно
  min_followers integer check (min_followers is null or min_followers >= 0),

  term_days integer not null check (term_days between 1 and 365),

  -- деньги целыми центами, как и везде
  budget_cents integer not null check (budget_cents between 1 and 100000000),

  -- вернуть заявку некуда без контакта, поэтому он обязателен
  contact text not null check (length(contact) between 3 and 320),

  notes text check (notes is null or length(notes) <= 500)
);

create index campaigns_created_at_idx on public.campaigns (created_at desc);
create index campaigns_placement_idx on public.campaigns (placement);

alter table public.campaigns enable row level security;

-- Как и в waitlist: форма ходит с публичным anon-ключом, поэтому разрешено
-- ровно одно действие - добавить свою заявку. Политик на select, update и
-- delete нет намеренно, иначе любой посетитель выкачал бы чужие бюджеты и
-- контакты.
create policy "anyone can ask for a campaign"
  on public.campaigns
  for insert
  to anon, authenticated
  with check (true);

-- Уникальности по контакту здесь нет, в отличие от waitlist: одна заявка на
-- человека имела смысл для очереди, а кампаний у покупателя бывает несколько.

comment on table public.campaigns is 'Заявки на кампанию: что покупатель хочет купить, пока витрина пуста';
comment on column public.campaigns.budget_cents is 'Бюджет на всю кампанию, в центах';
