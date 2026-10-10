# Family Budget Logger: features

A mobile app for **Android and iOS** that keeps a family's money in one place: day-to-day expenses and income, savings and investments, loans, and every insurance policy (health, term and others), with reminders before anything is due.

It follows the same principles as the Family Health Registry in this repo:

- **Private by default**: data lives on the phone in SQLite. No accounts, no bank logins, no servers, no analytics.
- **Offline first**: everything works without internet. Optional family sync uses the same free, end-to-end encrypted Google Drive script as the health app.
- **Made for Indian families**: rupees (₹, lakh/crore formatting), Indian instruments (PPF, EPF, NPS, FD/RD, SIPs, chit funds, gold, LIC), tax sections (80C, 80D, 24(b)), English and Telugu, light and dark mode.
- **Records, not advice**: the app totals, charts and reminds. It never recommends products or gives financial advice.

---

## 1. Home dashboard

The first screen answers "where do we stand this month?"

- **This month**: income, spent, saved, and what's left, with a bar showing how far through the month and the budget the family is.
- **Needs attention**: anything due or overdue in the next 7 days: EMIs, premiums, SIPs, RDs, credit-card bills, recurring bills (rent, school fees, electricity), policies expiring within 30 days, budgets over 80%.
- **Net worth** at a glance: savings + investments − loans outstanding (tap for detail).
- **Quick add** button (+) for an expense, income or transfer in under 5 seconds.
- **Recent entries**: the last 10 transactions.

Bottom tabs: **Home, Transactions, Budgets, Savings, Loans, Insurance** (Settings from the header).

## 2. Expenses and income

### Logging
- **Quick add**: amount → category → done. Date defaults to today, account to the last one used.
- Fields: amount, type (expense / income / transfer), category and sub-category, date, account (cash, bank account, UPI, credit card, wallet), family member (who spent / who earned), payee/merchant, notes, tags, receipt photo or PDF.
- **Transfers** between own accounts (bank → cash, bank → credit-card payment) are not counted as spending or income.
- **Split** one payment across categories (a supermarket bill: groceries + household + personal care).
- **Recurring entries**: rent, salary, school fees, subscriptions, maid/driver salary, milk, newspaper. Daily, weekly, monthly, quarterly, yearly or custom; logged automatically or as "confirm when paid".

### Categories (editable, with icons and colours)
- **Expenses**: Food & groceries, Eating out, Housing (rent, maintenance, property tax), Utilities (electricity, water, gas/LPG, internet, mobile, DTH), Transport (fuel, cab, metro/bus, vehicle service), Education (school/college fees, tuition, books), Health (doctor, medicines, lab tests), Shopping (clothes, electronics), Household help, Entertainment & subscriptions, Travel, Gifts & festivals, Personal care, Family support (parents), Donations, Taxes, Bank charges, Other.
- **Income**: Salary, Business/freelance, Rent received, Interest, Dividends, Bonus, Gifts received, Refunds/cashback, Other.

### Faster entry (phase 2+, all on the phone)
- **Read bank / UPI SMS (Android only, opt-in)**: suggest entries from debit/credit SMS ("Rs 450 debited… to SWIGGY"). Shown for confirmation, never auto-saved.
- **Import a bank statement** (CSV / Excel / PDF) with duplicate detection, like the lab-report importer in the health app.
- **Receipt photo** read with ML Kit text recognition (offline) for amount, date and merchant.
- **Merchant memory**: once "Swiggy" is Eating out, it stays Eating out.

### Viewing
- List grouped by day with daily totals; search by notes, payee, category, amount.
- Filters: date range, type, category, account, family member, tag.
- **Reports**: spend by category (donut), month-on-month trend (bars), income vs expense, top merchants, per-member spending, cash-flow calendar. Export as PDF or CSV/Excel.

## 3. Accounts

- Bank accounts, cash, wallets/UPI, credit cards, each with an opening balance and a running balance.
- **Credit cards**: limit, statement day, due day, current outstanding; reminder before the due date; "pay bill" logs a transfer from a bank account.
- Reconcile: enter the balance the bank shows; the app records the difference as an adjustment.

## 4. Budgets

- Monthly budget per category (and an overall monthly budget). Optional yearly budgets for things like insurance, school fees and festivals.
- Progress bars: spent / budget, with the expected pace for the date ("₹6,200 of ₹10,000, 18 days left").
- Alerts at 80% and 100% (notification, opt-in per budget).
- Roll over unused budget to next month (optional per category).
- **Sinking funds**: put aside a little every month for a known big expense (annual premium, school fees, Diwali, car insurance renewal); shows whether you're on track.

## 5. Savings and investments tracker

One list of everything the family owns, grouped by type, with the current value and the total.

| Type | What's tracked |
| --- | --- |
| Savings account | Bank, balance, interest rate |
| Fixed deposit (FD) | Bank, principal, rate, start and maturity dates, compounding, payout or cumulative, auto-renew; maturity amount worked out |
| Recurring deposit (RD) | Monthly instalment, rate, tenure, maturity; each instalment is a due item |
| PPF / SSY | Account, yearly deposits, financial-year limit (₹1.5 lakh), maturity year, extension |
| EPF / VPF | UAN, monthly employee + employer contribution, balance (updated by hand from the passbook) |
| NPS | Tier I / II, PRAN, contributions, current value |
| Mutual funds / SIPs | Fund name, folio, SIP amount and date, units, invested and current value (entered by hand) |
| Stocks | Holding, quantity, buy price, current value (by hand) |
| Gold | Physical (grams), SGB, digital gold; value from the gold rate you enter |
| Post office schemes | NSC, KVP, MIS, SCSS: principal, rate, maturity |
| Chit fund | Group, monthly instalment, months paid, prize taken or not |
| Real estate / other | Purchase value, current estimate |

- **Contributions** (SIP, RD, PPF deposit, chit instalment) are scheduled items: they show on the dashboard, can be marked paid, and log a transfer from the bank account.
- **Maturity calendar**: everything maturing in the next 12 months, with reminders 30 and 7 days before.
- **Nominee** recorded for each holding (and shown together in the family summary).
- **Asset allocation** chart: equity / debt / gold / cash / property.

### Savings goals
- Goal (emergency fund, child's education, house down payment, car, wedding, retirement, trip), target amount, target date, and linked accounts or holdings.
- Progress: saved so far, monthly amount needed to reach it, on track / behind.
- **Emergency fund** helper: shows months of expenses covered, based on the family's average monthly spend.

## 6. Loans tracker

For money the family **borrowed** and money it **lent**.

### Borrowed (home, car, two-wheeler, personal, education, gold, credit-card EMI, consumer durable, from family/friends)
- Lender, loan account number, principal, interest rate (fixed / floating), tenure, start date, EMI amount and EMI date, linked bank account, co-borrower, collateral.
- **EMI schedule** worked out (reducing balance): principal and interest split for every month, outstanding after each EMI. Edits when the rate changes (floating) with a choice to change EMI or tenure.
- **Progress**: paid so far, principal outstanding, interest paid so far, EMIs left, expected closure date.
- **Prepayment calculator**: "If I prepay ₹1 lakh now" → interest saved and months saved (reduce tenure or reduce EMI). Prepayments are logged as part of the history.
- **Reminders** before each EMI date; marking paid logs the expense split into principal (transfer) and interest (expense).
- **Tax view**: home-loan interest (24(b)) and principal (80C) per financial year; education-loan interest (80E).
- Loan closure checklist: NOC, original documents returned, lien removed (with document photos).

### Lent / informal
- Person, amount, date, expected return date, part repayments, interest if any, notes. Reminder on the expected date.

## 7. Insurance tracker

Every policy the family holds, with who is covered, what it costs and when it renews. **Health** and **term** have their own detail, since those are the policies families most need to find in a hurry.

### All policies
- Insurer, policy number, plan name, policy holder, insured members, nominee(s), sum assured / sum insured, premium, premium frequency (monthly / quarterly / half-yearly / yearly / single), next due date, grace period, start date, policy term and premium-paying term, agent or advisor contact, insurer helpline, policy document (PDF/photo).
- **Renewal reminders**: 30, 15, 7 and 1 day before the due date, and during the grace period. Marking paid logs the premium as an expense in the right category.
- **Yearly premium calendar**: all premiums by month, so the family can plan (feeds the sinking-fund budget).
- **Policy card**: a one-screen summary per policy with call buttons for the insurer and agent, shareable as PDF.

### Health insurance
- Type: individual, family floater, top-up / super top-up, employer group cover (with the date it ends if the job changes), senior citizen, critical illness, personal accident.
- Sum insured, deductible (for top-ups), no-claim bonus accumulated, room-rent limit, co-pay %, waiting periods (pre-existing diseases, specific illnesses) with the date each ends.
- Cashless network hospitals note, TPA name and helpline, health card photo for each member.
- **Claims log**: date, member, hospital, amount claimed, amount settled, cashless or reimbursement, status, documents. Sum insured remaining for the policy year is worked out.
- **Cover per member**: every person and the total health cover they have across policies (personal + employer + top-up).
- **80D**: premiums per financial year split into self/family and parents (and senior citizen), with the limit.
- Link to the Health app: the health-insurance record in the Family Health Registry can point to the same policy (phase 3).

### Term insurance
- Life assured, sum assured, policy term and the year cover ends (age at that time), premium-paying term, riders (accidental death, critical illness, waiver of premium), nominee(s) and share %, MWPA (Married Women's Property Act) yes/no.
- **Cover check** (informational only): total life cover across term + employer group life vs. outstanding loans + goals, shown as numbers, not advice.
- **"For my family" sheet**: a printable PDF listing every policy, insurer helpline, policy number, nominee and how to claim, for the family to keep.

### Other policies
- Life/endowment/money-back/ULIP (LIC and others): maturity date and expected maturity amount, survival benefits, bonus, loan against policy, surrender value (by hand).
- Vehicle (own damage + third party; IDV, NCB, renewal), home, travel, gadget, pet.

## 8. Bills and reminders

- One **Upcoming** list across everything: recurring bills, EMIs, premiums, SIP/RD/PPF contributions, credit-card due dates, FD maturities, policy expiries, lent-money returns.
- Phone notifications (opt-in per item, with a "days before" choice), like medicine reminders in the health app.
- Overdue items stay on the dashboard until marked paid or skipped.
- Optional **Android home-screen widget**: this month's spend vs budget and the next 3 dues.

## 9. Family

- Family members with a name and relation; every entry, holding, loan and policy can be tagged to a person.
- Per-member views: spending, income, holdings, policies covering them, loans in their name.
- **Family sync** (optional, free): the same encrypted Google Drive script approach as the health app, so both partners log from their own phones and see the same books. Newest edit wins; deletions sync.
- **Per-member privacy (phase 3)**: hide a person's personal accounts from the family view.

## 10. Reports and tax

- Monthly and yearly summary PDF: income, expenses by category, savings rate, net worth change, dues paid.
- **Financial-year view (April–March)**: tax-saving totals by section (80C: PPF, EPF, ELSS, life premium, home-loan principal, tuition fees, SSY, NSC; 80D health premiums; 80CCD(1B) NPS; 24(b) home-loan interest; 80E) against each limit, with the proofs (receipts) attached. Shows totals only; no tax computation or advice.
- **Net-worth history** chart, month by month.
- Export everything to CSV/Excel; full backup and restore as one encrypted file.

## 11. Settings, security and data

- **App lock**: fingerprint, face or phone PIN, re-lock after 1/5/15 minutes, hidden in the app switcher. Recommended on by default for a money app.
- **Hide amounts** toggle (show ₹•••• on the dashboard for when others are looking).
- Currency format: ₹ with Indian grouping (1,25,000 and "1.25 L" / "2.4 Cr"); other currencies for travel entries (phase 3).
- Month start day (for salaries that arrive on, say, the 25th) and financial-year start.
- Language: English and Telugu (instant switching). Theme: system / light / dark.
- Backup: encrypted file to share to Drive, WhatsApp, email; restore merges.
- Categories, accounts and tags are fully editable.

---

## Data model (outline)

| Table | Key fields |
| --- | --- |
| `members` | id, name, relation |
| `accounts` | id, name, kind (bank/cash/wallet/card), opening_balance, card limit/statement/due day |
| `categories` | id, name, kind (expense/income), parent_id, icon, colour |
| `transactions` | id, kind (expense/income/transfer), amount (paise, integer), date, account_id, to_account_id, category_id, member_id, payee, notes, tags, attachment, recurring_id, source_type/source_id (loan, policy, holding) |
| `transaction_splits` | transaction_id, category_id, amount |
| `recurring` | id, template fields, frequency rule, next_date, auto_log, reminder_days |
| `budgets` | id, category_id (null = overall), period, amount, rollover |
| `holdings` | id, type, name, institution, member_id, nominee, principal, rate, start/maturity dates, units, current_value, details (JSON per type) |
| `contributions` | holding_id, amount, date, schedule rule |
| `goals` | id, name, target, target_date, linked holding ids |
| `loans` | id, direction (borrowed/lent), type, lender/person, principal, rate, rate_type, tenure_months, start_date, emi, emi_day, account_id |
| `loan_events` | loan_id, kind (emi/prepayment/rate_change/disbursal), date, amount, principal_part, interest_part, new_rate |
| `policies` | id, kind (health/term/life/vehicle/…), insurer, number, plan, holder_id, sum_assured, premium, frequency, next_due, grace_days, start, term_end, nominees, agent, helpline, details (JSON per kind) |
| `policy_members` | policy_id, member_id |
| `claims` | policy_id, member_id, date, hospital, claimed, settled, status |
| `attachments` | owner type/id, file uri, mime |
| `reminders` | owner type/id, notify_at, notification id |

All amounts are stored as integer paise to avoid rounding errors. Every row carries `updated_at` and a device id for sync, as in the health app.

---

## Release plan

**Phase 1: MVP (logging and dues)**
- Members, accounts, categories
- Expenses / income / transfers with quick add, recurring entries, receipts
- Monthly budgets with alerts
- Insurance tracker: all policies, with health and term detail, renewal reminders
- Loans: EMI schedule, progress, EMI reminders
- Savings tracker: FD, RD, PPF, EPF, NPS, MF/SIP, gold, chit, other; maturity reminders
- Dashboard with "needs attention" and net worth
- App lock, dark mode, English + Telugu, encrypted backup/restore

**Phase 2: insight and speed**
- Reports and charts, PDF/CSV export, financial-year tax view
- Savings goals and sinking funds, emergency-fund helper
- Prepayment calculator, claims log
- Bank SMS suggestions (Android), statement import, receipt OCR
- Family sync, home-screen widget

**Phase 3: polish**
- Per-member privacy, multi-currency, "For my family" policy sheet, link to the Health app's insurance records

## Out of scope

- Connecting to bank accounts, Account Aggregator or brokers (keeps the app offline and login-free).
- Live market prices for stocks, funds or gold (values are entered by hand).
- Paying bills, buying products or any financial advice.
