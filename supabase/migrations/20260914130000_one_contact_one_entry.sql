-- Один контакт - одна заявка, на обе стороны сразу.
--
-- Пока правила не было, один и тот же телеграм записывался сколько угодно раз,
-- в том числе и продавцом, и покупателем. Список от этого перестаёт показывать,
-- сколько людей ждёт открытия, а сообщения при запуске уходят по одному адресу
-- по нескольку раз.
--
-- Сторона в правиле не участвует намеренно: человек выбирает, с какой стороны
-- он пришёл, а не занимает оба места в очереди.

-- Сначала сворачиваем то, что уже накопилось: остаётся самая ранняя заявка на
-- контакт, остальные удаляются. Данные заявок при этом не теряются - одинаковый
-- контакт и есть один человек.
delete from public.waitlist w
where w.contact is not null
  and exists (
    select 1
    from public.waitlist earlier
    where lower(earlier.contact) = lower(w.contact)
      and (
        earlier.created_at < w.created_at
        or (earlier.created_at = w.created_at and earlier.id < w.id)
      )
  );

-- Регистр не важен: @Eternaki и @eternaki - один и тот же человек, как и
-- Mail@Example.com с mail@example.com.
create unique index waitlist_contact_unique
  on public.waitlist (lower(contact))
  where contact is not null;

comment on index public.waitlist_contact_unique is
  'Один адрес или телеграм - одна заявка, независимо от стороны';
