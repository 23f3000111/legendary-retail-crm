# Sending mail from the CRM

**Date:** 2026-09-22, updated 2026-09-24
**Status:** Connected and tested. The sign-in code itself is still **off**,
waiting on one thing only — the right e-mail addresses (below).

## Where it stands

| | |
|---|---|
| Mail account | Resend, with `legendary.com.my` **verified** — mail can go to any inbox |
| Key | Stored in Supabase Vault (24 September) — not in a table, not in the repository |
| Sent from | `Legendary <noreply@legendary.com.my>` |
| Test | Sent to Resend's test inbox on 24 September; Resend accepted it |
| Sign-in code | **Off** |

**Why it is still off:** every leadership login has a guessed address
(`vinslim@`, `limdavy28@`, `kellytew@`, `chloechock@`, `imran@` — all
`@legendary.com.my`). The moment the code is on, it goes to whatever address
the login holds. One wrong address and that person cannot sign in. Confirm
the five (see *Before you do turn it on*, below), correct any that are wrong
on the Logins screen, then run step 4.

---

The only mail the system sends today is the **six-digit sign-in code** for
leadership and IT. Everything else it has to say, it says on screen.

---

## What you need first

A mail provider with an API. The system is written for
**[Resend](https://resend.com)** — free for 3,000 messages a month, which is
far more than this will ever use, and the quickest to set up.

Any other provider works the same way; it is one URL and one JSON body in
`_send_mail()` in
[`0005_mail.sql`](../../supabase/migrations/0005_mail.sql), and nothing else
changes.

### Setting up Resend

1. Sign up at [resend.com](https://resend.com).
2. **API Keys → Create API Key.** Name it `legendary-crm`, permission
   **Sending access**. Copy the key — it starts `re_` and is shown once.
3. Leave the domain alone for now. Resend lets you send from
   `onboarding@resend.dev` immediately, which is enough to test with.

---

## Switching it on

In the Supabase **SQL Editor**, four statements. Do them in order and stop if
one does not do what it says.

### 1. Store the key

```sql
select set_mail_key('re_xxxxxxxxxxxxxxxxxxxxxxxx');
```

It goes into Supabase Vault, the same place the password key lives — not into
a table, and not into this repository.

### 2. Send yourself one

```sql
select send_test_mail('your.own@address.com');
```

Then look at what happened:

```sql
select * from mail_status();
```

| What it says | What it means |
|---|---|
| `delivered to the provider` | Resend took it. Check your inbox, and your spam folder. |
| `refused (401)` | The key is wrong. Run step 1 again. |
| `refused (403)` | The from-address is not one Resend will send for. See step 3. |
| `not sent` | It never left. The reason is in the last column. |
| `still sending` | Wait a few seconds and look again. |

### 3. Send from your own address

Optional, and worth doing before real staff rely on it — a code from
`onboarding@resend.dev` looks like something to delete.

In Resend: **Domains → Add Domain**, `legendary.com.my`, and add the DNS
records it gives you. When it goes green:

```sql
select set_setting('mail_from', '"Legendary CRM <crm@legendary.com.my>"'::jsonb);
```

Test again with step 2.

### 4. Turn the second step on

**Only once a test message has actually arrived.**

```sql
select set_setting('two_step', 'true'::jsonb);
```

From that moment, Vins, Davy, Kelly, Chloe and Imran are asked for a code
after their password. Everybody else is unaffected — the client asked for the
second step at the top of the chart only.

To turn it off again:

```sql
select set_setting('two_step', 'false'::jsonb);
```

---

## Before you do turn it on

**Check the addresses.** Every login is currently
`‹username›@legendary.com.my`, which was a guess. The code goes wherever the
login says, so a wrong address locks that person out.

```sql
select doc->>'name' as name, username, doc->>'email' as email
  from people where role in ('director','md','ops','pa','it') order by name;
```

Correct any of them from the **Logins** screen, or:

```sql
update people set doc = doc || '{"email":"kelly@legendary.com.my"}'::jsonb
 where username = 'kellytew';
```

**Keep one way back in.** If leadership's mail breaks, nobody at the top can
sign in to the CRM. The way back is the Supabase dashboard, which does not go
through the CRM's sign-in at all: SQL Editor, the statement above that turns
it off, and everybody is in on their password again. That is why it is one
setting and not a code change — keep the Supabase login somewhere safe.

---

## How it behaves

- **The code never blocks a sign-in on the mail service.** The request is
  queued and the person is told to check their mail. If the send fails, it
  fails in `mail_log`, and they ask for a new code.
- **A code lasts ten minutes**, is good once, and five wrong tries throw the
  attempt away.
- **Nothing about the code is written to the activity log** — only that one
  was sent, and to which masked address. A log that carried the codes would be
  as good as the mailbox.
- **The mail log keeps who it was sent to, masked, and whether it left.** Never
  the code, and never the message.

```sql
select * from mail_status();        -- the last fifty, newest first
```

---

## What is deliberately not sent by mail

The client asked for notifications inside the system only (Q75), so none of
these go out as mail: a missed closing, an order waiting for Kelly, stock
below its reorder point, a correction to approve. They are on the Alerts
screen and in the bar at the top.

If that changes, `_send_mail()` is the one place to call.
