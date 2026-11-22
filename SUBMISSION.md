# Submission text (copy into the hackathon form)

**Project name:** Prapti (ప్రాప్తి · प्राप्ति): receive what's yours

**Problem statement:** PS5 · Citizens and Public Services · Claim What's Yours

**One-line description:**
A student in Telangana describes their life in plain words, even Telugu or Hindi typed in English letters, and Prapti shows which scholarships they are likely eligible for and why, one combined document list for a single trip to Mee Seva, the steps to apply, and reminders before every last date.

**Description (about 150 words):**
Every year, eligible students in Telangana miss scholarships because the rules are scattered, the document list is unclear, and middlemen charge for help that should be free. Prapti asks only for plain words, never an ID number. Its offline reader understands English, Telugu, Hindi, and Telugu or Hindi typed in English letters (100% of details read correctly on 72 test messages, nothing invented), then asks only the questions that would change a result. A plain rules engine checks 10 Telangana and central schemes and shows every rule with the student's own answer, including "nearly a match: ₹20,000 over the limit". All documents for all their schemes come as one list grouped by place, with a warning when a certificate takes longer than the days left. A tracker, reminders and WhatsApp sharing follow. Rules are editable data; a page checker flags official pages that changed. Free for students; NGOs, CSR funds and Mee Seva centres use Helper mode.

**Team:** KAVY · Vedangi Karthik and Siddharth Kaithi

**Live demo (works on any phone, nothing to install):** https://prapti-telangana.vercel.app

**GitHub repository:** https://github.com/KAVY-01/prapti

**How to run:** see README.md (`pip install -r requirements.txt`, then `python app.py`, open http://127.0.0.1:5050).

**Demo path for judges (2 minutes):**
1. Open the link on a phone. Type `nenu ammayi, B.Tech first year, memu SC, aadayam nelaku 8 velu, Nalgonda palle` → answer two taps → results with the amount and the first step.
2. Open "AICTE Pragati" → every rule with her own answer, last date, and documents.
3. Back → "See my one-trip list" → documents grouped by place, with the "apply today" warning.
4. Add a scheme to My tracker → see days left and the next step.
5. Switch to తెలుగు or हिंदी in the top bar; "Send on WhatsApp" on the results.
6. About → "See when each scheme was last checked" → "Check the official pages now".
