# Submission text (copy into the hackathon form)

**Project name:** Prapti (ప్రాప్తి · प्राप्ति): receive what's yours

**Problem statement:** PS5 · Citizens and Public Services · Claim What's Yours

**One-line description:**
A student in Telangana describes their life in plain words, even Telugu or Hindi typed in English letters, and Prapti shows which scholarships they are likely eligible for and why, one combined document list for a single trip to Mee Seva, the steps to apply, and reminders before every last date.

**Description (about 170 words):**
Every year, eligible students in Telangana miss scholarships because the rules are scattered, the document list is unclear, and middlemen charge for help that should be free. Prapti asks only for plain words, never an ID number. Its offline reader understands English, Telugu, Hindi, and Telugu or Hindi typed in English letters, typed or spoken (100% of details read correctly on 72 test messages, nothing invented), then asks only the questions that would change a result. A plain rules engine checks 10 Telangana and central schemes and shows every rule with the student's own answer, including "nearly a match: ₹20,000 over the limit". A "What if?" slider re-checks every scheme live as income or marks change and shows the exact limit that decides it. All documents for all their schemes come as one list grouped by place, with a warning when a certificate takes longer than the days left. A tracker, reminders and WhatsApp sharing follow, and opened pages keep working offline. Rules are editable data; a page checker flags official pages that changed. Free for students; NGOs, CSR funds and Mee Seva centres use Helper mode.

**Business model (who pays, and why it stays free for students):**
- The gap: in 2023-24 only 4,20,262 fresh students registered on Telangana's ePASS portal against about 5.50 lakh expected, and the deadline was extended (Telangana Today, 1 Feb 2024: https://telanganatoday.com/telangana-govt-extends-last-date-for-registration-of-post-matric-scholarships). Middlemen charge ₹500–2,000 per application to fill that gap.
- Students: free, always.
- NGOs and education trusts: Helper mode (many students on one device, printable checklists, impact count) as a low-cost licence per district. Proposed pilot price: ₹2,000 per district per month.
- CSR funds: sponsor a district and receive an outcome report (students reached, rupees of scholarships unlocked per rupee spent). Proposed: ₹1,50,000 per district per year.
- Banks: a referral fee on education-loan schemes only, always shown below free schemes.
- State or district: a pilot contract to run it statewide.
- Running cost stays near zero: eligibility runs on plain rules (no paid AI), on free-tier hosting.
- Next step: a pilot with three colleges or NGOs in Warangal and Nalgonda, measuring applications filed and scholarships received.

**How we used Codebenders:**
- Planned in the Codebenders IDE: its Nexen Guide produced the product plan, the screen list and a starter project, which set the structure the final app kept (plain-words input, rules engine, per-scheme checklist, tracker).

**Team:** KAVY · Vedangi Karthik and Siddharth Kaithi

**Live demo (works on any phone, nothing to install):** https://prapti-telangana.vercel.app

**GitHub repository:** https://github.com/KAVY-01/prapti

**How to run:** see README.md (`pip install -r requirements.txt`, then `python app.py`, open http://127.0.0.1:5050).

**Fastest look (90 seconds):** open https://prapti-telangana.vercel.app/demo and press Next. A guide walks through a real result screen by screen.

**Demo path for judges (2 minutes):**
1. Open the link on a phone. Type `nenu ammayi, B.Tech first year, memu SC, aadayam nelaku 8 velu, Nalgonda palle` (or tap the mic and say it) → answer two taps → results with the amount and the first step.
   Then drag the "What if?" income slider past ₹2,50,000 and watch schemes drop out, with the limit that decided it.
2. Open "AICTE Pragati" → every rule with her own answer, last date, and documents.
3. Back → "See my one-trip list" → documents grouped by place, with the "apply today" warning.
4. Add a scheme to My tracker → see days left and the next step.
5. Switch to తెలుగు or हिंदी in the top bar; "Send on WhatsApp" on the results.
6. About → "See when each scheme was last checked" → "Check the official pages now".
