// HTML fixtures modelled on common Kerala result page layouts.

export const OFFICIAL_STYLE = `<!doctype html><html><head><title>Karunya Plus Lottery KN-512 Result</title>
<script>var x = "1st Prize 999999";</script><style>.a{}</style></head><body>
<h1>KERALA STATE LOTTERIES - RESULT</h1>
<p>KARUNYA PLUS LOTTERY NO.KN-512th DRAW held on:- 12/03/2024,AT GORKY BHAVAN, NEAR BAKERY JUNCTION</p>
<p>1st Prize Rs :8000000/- 1) PN 012345 (KOTTAYAM)</p>
<p>Agent Name : JOHN K &nbsp; Agency No.: K 1234</p>
<p>Consolation Prize Rs :8000/- PO 012345 PP 012345 PR 012345</p>
<p>2nd Prize Rs :1000000/- 1) PO 654321 (THRISSUR)</p>
<p>3rd Prize Rs :100000/- 1) PN 100200 (KANNUR) 2) PO 300400 (KOLLAM) 3) PP 000999 (PALAKKAD)</p>
<table><tr><td>4th Prize Rs :5000/-</td></tr>
<tr><td>0123</td><td>4567</td><td>8901</td><td>0007</td></tr></table>
<p>5th Prize Rs :2000/-</p><p>0012 5555 9090</p>
<p>The prize winners are requested to verify the winning numbers with the result published in the Kerala Government Gazette 2024 and surrender the winning tickets within 30 days.</p>
</body></html>`;

export const TABLE_STYLE = `<html><head><title>Kerala Lottery Result Today | Win-Win W-765</title></head><body>
<nav><a href="/">Home</a> <a href="/privacy">Privacy</a></nav>
<h2>Win Win Lottery Result W-765 — 01 April 2024</h2>
<table>
<tr><th>Prize</th><th>Winning Numbers</th></tr>
<tr><td>First Prize ₹75 Lakhs</td><td>WA 076543</td></tr>
<tr><td>Consolation Prize ₹8,000</td><td>WB 076543, WC 076543</td></tr>
<tr><td>Second Prize ₹5 Lakhs</td><td>WD 123456</td></tr>
<tr><td>Fourth Prize ₹5,000</td><td>1111 2222 0303</td></tr>
</table>
<p>Older results: <a href="/results/win-win-w-764">Win Win W-764</a> <a href="/results/karunya-kr-600">Karunya KR-600</a>
<a href="/results/page/2">Older »</a> <a href="/files/result.pdf">PDF</a> <a href="https://other.example/results">Other site</a></p>
</body></html>`;

export const NO_RESULTS = `<html><head><title>About us</title></head><body><p>We publish lottery news.</p></body></html>`;

export const CLOUDFLARE_CHALLENGE = `<html><head><title>Just a moment...</title></head><body><div id="cf-challenge-running"></div><script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script></body></html>`;

export const CAPTCHA_PAGE = `<html><body><form><div class="g-recaptcha" data-sitekey="x"></div></form></body></html>`;

export function resultPage({ name, code, n, date, first }) {
  return `<html><head><title>${name} Lottery ${code}-${n} Result</title></head><body>
<p>${name.toUpperCase()} LOTTERY NO.${code}-${n} DRAW held on:- ${date}</p>
<p>1st Prize Rs :7000000/- 1) PA ${first} (ERNAKULAM)</p>
<p>4th Prize Rs :5000/- 1234 5678</p>
<a href="/results/${code.toLowerCase()}-${n - 1}">Previous result</a></body></html>`;
}
