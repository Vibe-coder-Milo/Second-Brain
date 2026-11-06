from dbg import *
import json
FILED = [
  ('career', 'Q3 promotion case', 'Draft the promotion case for my manager. Led the platform rollout, KPIs met, stakeholder feedback from the MD was strong.'),
  ('career', 'Team offsite agenda', 'Agenda for the team offsite: roadmap review, hiring plan, presentation to the steering committee.'),
  ('investing', 'DBS dividend', 'DBS raised its dividend; yield now about 5.8%. Compare with OCBC and UOB before adding to the portfolio.'),
  ('investing', 'REIT watchlist', 'Watchlist: CapitaLand Integrated Commercial Trust, Mapletree Logistics. Check gearing and DPU growth.'),
  ('travel', 'Kyoto trip', 'Five days in Kyoto in April: ryokan near Gion, Fushimi Inari early morning, day trip to Nara. Flights booked on SQ.'),
  ('ideas', 'Atomic habits notes', 'Book notes: habits stack, make it obvious, attractive, easy and satisfying. Identity-based habits.'),
  ('people', 'Dinner with Wei Ling', 'Catch up dinner with Wei Ling, she is moving to London next year. Her birthday is 14 May.'),
]
INBOX = [
  ('property', 'Kitchen renovation quotes', 'Got three quotes for the kitchen and bedroom reno. Contractor A 45k, contractor B 52k with carpentry. Need the HDB renovation permit before work starts.'),
  ('property', 'Mortgage refinancing', 'Bank offering fixed 2.6% for two years versus floating SORA. Lock-in period is 2 years. Use CPF for the monthly instalment.'),
  ('property', 'Tenant moving out', 'Tenant moving out end of March. Fix the aircon and repaint before viewings, then list the unit again on PropertyGuru.'),
  ('property', 'Condo or HDB resale', 'Comparing a 4-room HDB resale in Tampines with a 2-bedroom condo in Pasir Ris. Stamp duty and ABSD, loan limits.'),
  ('health', 'Marathon training plan', 'Week 6 of marathon training: long run 24km Sunday, tempo run Wednesday, rest day Friday. Sleep 7.5 hours.'),
  ('food', 'Laksa recipe', 'Laksa paste: dried chilli, shallots, lemongrass, galangal, candlenuts, belacan. Simmer with coconut milk and prawn stock.'),
  ('projects', 'Trip tracker bug', 'Bug in my trip tracker app: expenses total wrong after editing a day. Check the reducer and push a fix to GitHub.'),
  ('career', 'Feedback from MD', 'MD said my presentation to the committee was clear, wants me to lead the next quarter planning with the team.'),
  ('investing', 'S&P 500 ETF', 'Consider dollar cost averaging into an S&P 500 ETF each month, check the expense ratio and withholding tax.'),
  ('money', 'Income tax filing', 'File income tax on IRAS by 18 April. Claim course fees relief and CPF top-up relief. Check the payslip totals.'),
  ('none', 'Sunday thoughts', 'Felt a bit tired today. Quiet afternoon.'),
]
def steps(page):
    J = lambda js, arg=None: page.evaluate(js, arg)
    J("""async ({ filed, inbox }) => { const V = await import('./js/vault.js'); const M = await import('./js/model.js');
      for (const [r, t, b] of filed) await V.saveNote(M.newNote({ title: t, titleAuto: false, body: b, region: r, inbox: false }));
      for (const [r, t, b] of inbox) await V.saveNote(M.newNote({ title: t, titleAuto: false, body: b, region: null, inbox: true })); }""", {'filed': FILED, 'inbox': INBOX})
    res = J("""async () => { const O = await import('./js/organiser.js'); const V = await import('./js/vault.js');
      const notes = [...V.state.notes.values()].filter((n) => n.inbox);
      const S = await import('./js/semantic.js'); await S.buildIndex();
      const plans = await O.plan(notes);
      return notes.map((n) => { const p = plans.find((x) => x.note.id === n.id); return [n.title, p ? (p.to ? p.to.id : 'NEW:' + p.area.id) : '-', p ? Math.round(p.score * 1000) / 1000 : null, p ? p.sure : null]; }); }""")
    for r in res: print(r)
if __name__ == '__main__':
    run(steps, vp=(1180, 820), mob=False)
