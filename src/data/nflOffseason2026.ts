// Selective 2026 NFL offseason snapshot compiled from public transaction reporting.
// Updated through June 23, 2026. This is not a complete 90-man roster transaction log.

export type NflCoachStatus = "Changed" | "Returning";
export type NflMoveMethod = "Free agency" | "Trade";

export type NflCoachChange = {
  abbr: string;
  headCoach2025: string;
  headCoach2026: string;
  status: NflCoachStatus;
  note: string;
};

export type NflPlayerMove = {
  player: string;
  position: string;
  from: string;
  to: string;
  method: NflMoveMethod;
};

export type NflOffseasonProfile = NflCoachChange & {
  additions: NflPlayerMove[];
  departures: NflPlayerMove[];
  verifiedAt: string;
};

export const NFL_OFFSEASON_DATA_VERIFIED_AT = "2026-06-23";

const COACH_CHANGES: Record<string, Omit<NflCoachChange, "abbr">> = {
  ari: { headCoach2025: "Jonathan Gannon", headCoach2026: "Mike LaFleur", status: "Changed", note: "LaFleur takes over after serving as the Rams' offensive coordinator." },
  atl: { headCoach2025: "Raheem Morris", headCoach2026: "Kevin Stefanski", status: "Changed", note: "Stefanski takes over after six seasons as Cleveland's head coach." },
  bal: { headCoach2025: "John Harbaugh", headCoach2026: "Jesse Minter", status: "Changed", note: "Minter takes over after coordinating the Chargers' defense." },
  buf: { headCoach2025: "Sean McDermott", headCoach2026: "Joe Brady", status: "Changed", note: "Brady was promoted from offensive coordinator." },
  car: { headCoach2025: "Dave Canales", headCoach2026: "Dave Canales", status: "Returning", note: "Canales returns for the 2026 season." },
  chi: { headCoach2025: "Ben Johnson", headCoach2026: "Ben Johnson", status: "Returning", note: "Johnson returns for the 2026 season." },
  cin: { headCoach2025: "Zac Taylor", headCoach2026: "Zac Taylor", status: "Returning", note: "Taylor returns for the 2026 season." },
  cle: { headCoach2025: "Kevin Stefanski", headCoach2026: "Todd Monken", status: "Changed", note: "Monken takes over after coordinating Baltimore's offense." },
  dal: { headCoach2025: "Brian Schottenheimer", headCoach2026: "Brian Schottenheimer", status: "Returning", note: "Schottenheimer returns for the 2026 season." },
  den: { headCoach2025: "Sean Payton", headCoach2026: "Sean Payton", status: "Returning", note: "Payton returns for the 2026 season." },
  det: { headCoach2025: "Dan Campbell", headCoach2026: "Dan Campbell", status: "Returning", note: "Campbell returns for the 2026 season." },
  gb: { headCoach2025: "Matt LaFleur", headCoach2026: "Matt LaFleur", status: "Returning", note: "LaFleur returns for the 2026 season." },
  hou: { headCoach2025: "DeMeco Ryans", headCoach2026: "DeMeco Ryans", status: "Returning", note: "Ryans returns for the 2026 season." },
  ind: { headCoach2025: "Shane Steichen", headCoach2026: "Shane Steichen", status: "Returning", note: "Steichen returns for the 2026 season." },
  jax: { headCoach2025: "Liam Coen", headCoach2026: "Liam Coen", status: "Returning", note: "Coen returns for the 2026 season." },
  kc: { headCoach2025: "Andy Reid", headCoach2026: "Andy Reid", status: "Returning", note: "Reid returns for the 2026 season." },
  lv: { headCoach2025: "Pete Carroll", headCoach2026: "Klint Kubiak", status: "Changed", note: "Kubiak takes over after coordinating Seattle's offense." },
  lac: { headCoach2025: "Jim Harbaugh", headCoach2026: "Jim Harbaugh", status: "Returning", note: "Harbaugh returns for the 2026 season." },
  lar: { headCoach2025: "Sean McVay", headCoach2026: "Sean McVay", status: "Returning", note: "McVay returns for the 2026 season." },
  mia: { headCoach2025: "Mike McDaniel", headCoach2026: "Jeff Hafley", status: "Changed", note: "Hafley takes over after coordinating Green Bay's defense." },
  min: { headCoach2025: "Kevin O'Connell", headCoach2026: "Kevin O'Connell", status: "Returning", note: "O'Connell returns for the 2026 season." },
  ne: { headCoach2025: "Mike Vrabel", headCoach2026: "Mike Vrabel", status: "Returning", note: "Vrabel returns for the 2026 season." },
  no: { headCoach2025: "Kellen Moore", headCoach2026: "Kellen Moore", status: "Returning", note: "Moore returns for the 2026 season." },
  nyg: { headCoach2025: "Brian Daboll / Mike Kafka (interim)", headCoach2026: "John Harbaugh", status: "Changed", note: "Harbaugh takes over after 18 seasons leading Baltimore." },
  nyj: { headCoach2025: "Aaron Glenn", headCoach2026: "Aaron Glenn", status: "Returning", note: "Glenn returns for the 2026 season." },
  phi: { headCoach2025: "Nick Sirianni", headCoach2026: "Nick Sirianni", status: "Returning", note: "Sirianni returns for the 2026 season." },
  pit: { headCoach2025: "Mike Tomlin", headCoach2026: "Mike McCarthy", status: "Changed", note: "McCarthy takes over after Tomlin's departure." },
  sf: { headCoach2025: "Kyle Shanahan", headCoach2026: "Kyle Shanahan", status: "Returning", note: "Shanahan returns for the 2026 season." },
  sea: { headCoach2025: "Mike Macdonald", headCoach2026: "Mike Macdonald", status: "Returning", note: "Macdonald returns for the 2026 season." },
  tb: { headCoach2025: "Todd Bowles", headCoach2026: "Todd Bowles", status: "Returning", note: "Bowles returns for the 2026 season." },
  ten: { headCoach2025: "Brian Callahan / Mike McCoy (interim)", headCoach2026: "Robert Saleh", status: "Changed", note: "Saleh takes over after serving as San Francisco's defensive coordinator." },
  wsh: { headCoach2025: "Dan Quinn", headCoach2026: "Dan Quinn", status: "Returning", note: "Quinn returns for the 2026 season." },
};

export const NFL_NOTABLE_PLAYER_MOVES: NflPlayerMove[] = [
  { player: "Kirk Cousins", position: "QB", from: "atl", to: "lv", method: "Free agency" },
  { player: "Gardner Minshew", position: "QB", from: "kc", to: "ari", method: "Free agency" },
  { player: "Kyler Murray", position: "QB", from: "ari", to: "min", method: "Free agency" },
  { player: "Tua Tagovailoa", position: "QB", from: "mia", to: "atl", method: "Free agency" },
  { player: "Malik Willis", position: "QB", from: "gb", to: "mia", method: "Free agency" },
  { player: "Rico Dowdle", position: "RB", from: "car", to: "pit", method: "Free agency" },
  { player: "Travis Etienne", position: "RB", from: "jax", to: "no", method: "Free agency" },
  { player: "Kenneth Gainwell", position: "RB", from: "pit", to: "tb", method: "Free agency" },
  { player: "Isiah Pacheco", position: "RB", from: "kc", to: "det", method: "Free agency" },
  { player: "Patrick Ricard", position: "FB", from: "bal", to: "nyg", method: "Free agency" },
  { player: "Kenneth Walker III", position: "RB", from: "sea", to: "kc", method: "Free agency" },
  { player: "Rachaad White", position: "RB", from: "tb", to: "wsh", method: "Free agency" },
  { player: "Romeo Doubs", position: "WR", from: "gb", to: "ne", method: "Free agency" },
  { player: "Mike Evans", position: "WR", from: "tb", to: "sf", method: "Free agency" },
  { player: "Jauan Jennings", position: "WR", from: "sf", to: "min", method: "Free agency" },
  { player: "Darnell Mooney", position: "WR", from: "atl", to: "nyg", method: "Free agency" },
  { player: "Kalif Raymond", position: "WR", from: "det", to: "chi", method: "Free agency" },
  { player: "Wan'Dale Robinson", position: "WR", from: "nyg", to: "ten", method: "Free agency" },
  { player: "Isaiah Likely", position: "TE", from: "bal", to: "nyg", method: "Free agency" },
  { player: "David Njoku", position: "TE", from: "cle", to: "lac", method: "Free agency" },
  { player: "David Edwards", position: "OL", from: "buf", to: "no", method: "Free agency" },
  { player: "Zion Johnson", position: "G", from: "lac", to: "cle", method: "Free agency" },
  { player: "Tyler Linderbaum", position: "C", from: "bal", to: "lv", method: "Free agency" },
  { player: "Dylan Parham", position: "G", from: "lv", to: "nyj", method: "Free agency" },
  { player: "Wyatt Teller", position: "G", from: "cle", to: "hou", method: "Free agency" },
  { player: "Alijah Vera-Tucker", position: "G", from: "nyj", to: "ne", method: "Free agency" },
  { player: "Lucas Patrick", position: "OL", from: "cin", to: "nyg", method: "Free agency" },
  { player: "Elgton Jenkins", position: "G", from: "gb", to: "cle", method: "Free agency" },
  { player: "Rasheed Walker", position: "OT", from: "gb", to: "car", method: "Free agency" },
  { player: "John Franklin-Myers", position: "DL", from: "den", to: "ten", method: "Free agency" },
  { player: "Trey Hendrickson", position: "EDGE", from: "cin", to: "bal", method: "Free agency" },
  { player: "Dre'Mont Jones", position: "DL", from: "bal", to: "ne", method: "Free agency" },
  { player: "Kwity Paye", position: "EDGE", from: "ind", to: "lv", method: "Free agency" },
  { player: "Joseph Ossai", position: "EDGE", from: "cin", to: "nyj", method: "Free agency" },
  { player: "Odafe Oweh", position: "EDGE", from: "lac", to: "wsh", method: "Free agency" },
  { player: "Cameron Sample", position: "EDGE", from: "cin", to: "sf", method: "Free agency" },
  { player: "Jonathan Allen", position: "DT", from: "min", to: "cin", method: "Free agency" },
  { player: "Alex Anzalone", position: "LB", from: "det", to: "tb", method: "Free agency" },
  { player: "Bradley Chubb", position: "EDGE", from: "mia", to: "buf", method: "Free agency" },
  { player: "Demario Davis", position: "LB", from: "no", to: "nyj", method: "Free agency" },
  { player: "Tremaine Edmunds", position: "LB", from: "chi", to: "nyg", method: "Free agency" },
  { player: "Kaden Elliss", position: "LB", from: "atl", to: "no", method: "Free agency" },
  { player: "Devin Lloyd", position: "LB", from: "jax", to: "car", method: "Free agency" },
  { player: "Boye Mafe", position: "EDGE", from: "sea", to: "cin", method: "Free agency" },
  { player: "Jaelan Phillips", position: "EDGE", from: "phi", to: "car", method: "Free agency" },
  { player: "Quay Walker", position: "LB", from: "gb", to: "lv", method: "Free agency" },
  { player: "Quincy Williams", position: "LB", from: "nyj", to: "cle", method: "Free agency" },
  { player: "Akeem Davis-Gaither", position: "LB", from: "ari", to: "ind", method: "Free agency" },
  { player: "David Ojabo", position: "EDGE", from: "bal", to: "mia", method: "Free agency" },
  { player: "Coby Bryant", position: "DB", from: "sea", to: "chi", method: "Free agency" },
  { player: "Kevin Byard", position: "S", from: "chi", to: "ne", method: "Free agency" },
  { player: "Bryan Cook", position: "S", from: "kc", to: "cin", method: "Free agency" },
  { player: "Nick Cross", position: "S", from: "ind", to: "wsh", method: "Free agency" },
  { player: "Jamel Dean", position: "CB", from: "tb", to: "pit", method: "Free agency" },
  { player: "Cobie Durant", position: "CB", from: "lar", to: "dal", method: "Free agency" },
  { player: "C. J. Gardner-Johnson", position: "S", from: "chi", to: "buf", method: "Free agency" },
  { player: "Alontae Taylor", position: "CB", from: "no", to: "ten", method: "Free agency" },
  { player: "Jalen Thompson", position: "S", from: "ari", to: "dal", method: "Free agency" },
  { player: "Jaylen Watson", position: "CB", from: "kc", to: "lar", method: "Free agency" },
  { player: "L'Jarius Sneed", position: "CB", from: "ten", to: "kc", method: "Free agency" },
  { player: "Tariq Woolen", position: "CB", from: "sea", to: "phi", method: "Fre agency" },
  { player: "Cam Taylor-Britt", position: "CB", from: "cin", to: "ind", method: "Fre agency" },
  { player: "Marco Wilson", position: "CB", from: "cin", to: "mia", method: "Free agency" },
  { player: "Geno Stone", position: "S", from: "cin", to: "buf", method: "Free agency" },
  { player: "Kyle Dugger", position: "S", from: "pit", to: "cin", method: "Fre agency" },
  { player: "Ja'Sir Taylor", position: "CB", from: "nyj", to: "cin", method: "Fre agency" },
  { player: "Geno Smith", position: "QB", from: "lv", to: "nyj", method: "Trade" },
  { player: "David Montgomery", position: "RB", from: "det", to: "hou", method: "Trade" },
  { player: "Juice Scruggs", position: "C", from: "hou", to: "det", method: "Trade" },
  { player: "D. J. Moore", position: "WR", from: "chi", to: "buf", method: "Trade" },
  { player: "Trent McDuffie", position: "CB", from: "kc", to: "lar", method: "Trade" },
  { player: "Minkah Fitzpatrick", position: "S", from: "mia", to: "nyj", method: "Trade" },
  { player: "Colby Wooden", position: "DT", from: "gb", to: "ind", method: "Trade" },
  { player: "Zaire Franklin", position: "LB", from: "ind", to: "gb", method: "Trade" },
  { player: "Rashan Gary", position: "EDGE", from: "gb", to: "dal", method: "Trade" },
  { player: "T'Vondre Sweat", position: "DT", from: "ten", to: "nyj", method: "Trade" },
  { player: "Jermaine Johnson IHˆ°Á½Í¥Ñ¥½¸è€‰ˆ°™É½´è€‰¹å¨ˆ°Ñ¼è€‰Ñ•¸ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰=Í„=‘¥¡¥éÕİ„ˆ°Á½Í¥Ñ¥½¸è€‰Pˆ°™É½´è€‰‘…°ˆ°Ñ¼è€‰Í˜ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰Q…É½¸)½¡¹Í½¸ˆ°Á½Í¥Ñ¥½¸è€‰ˆ°™É½´è€‰‰Õ˜ˆ°Ñ¼è€‰±Øˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰)…å±•¸]…‘‘±”ˆ°Á½Í¥Ñ¥½¸è€‰]Hˆ°™É½´è€‰µ¥„ˆ°Ñ¼è€‰‘•¸ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰Må‘¹•ä	É½İ¸ˆ°Á½Í¥Ñ¥½¸è€‰Lˆ°™É½´è€‰Á¡¤ˆ°Ñ¼è€‰…Ñ°ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰¹‘ä…±Ñ½¸ˆ°Á½Í¥Ñ¥½¸è€‰Eˆ°™É½´è€‰…Èˆ°Ñ¼è€‰Á¡¤ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰IÕ­”=É¡½É¡½É¼ˆ°Á½Í¥Ñ¥½¸è€‰Pˆ°™É½´è€‰…Ñ°ˆ°Ñ¼è€‰©…àˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰5……Í½¸Mµ¥Ñ ˆ°Á½Í¥Ñ¥½¸è€‰Pˆ°™É½´è€‰©…àˆ°Ñ¼è€‰…Ñ°ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰•áÑ•È1…İÉ•¹”ˆ°Á½Í¥Ñ¥½¸è€‰Pˆ°™É½´è€‰¹åœˆ°Ñ¼è€‰¥¸ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰)½¹…Ñ¡…¸É••¹…Éˆ°Á½Í¥Ñ¥½¸è€‰ˆ°™É½´è€‰µ¥¸ˆ°Ñ¼è€‰Á¡¤ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰5å±•Ì…ÉÉ•ÑĞˆ°Á½Í¥Ñ¥½¸è€‰ˆ°™É½´è€‰±”ˆ°Ñ¼è€‰±…Èˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰)…É•Y•ÉÍ”ˆ°Á½Í¥Ñ¥½¸è€‰ˆ°™É½´è€‰±…Èˆ°Ñ¼è€‰±”ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°(€ìÁ±…å•Èè€‰¸(¸	É½İ¸ˆ°Á½Í¥Ñ¥½¸è€‰]Hˆ°™É½´è€‰Á¡¤ˆ°Ñ¼è€‰¹”ˆ°µ•Ñ¡½è€‰QÉ…‘”ˆô°)tì()•áÁ½ÉĞ™Õ¹Ñ¥½¸•Ñ9™±=™™Í•…Í½¹AÉ½™¥±”¡…‰‰ÈèÍÑÉ¥¹œ¤è9™±=™™Í•…Í½¹AÉ½™¥±”ì(€½¹ÍĞ­•ä€ô…‰‰È¹Ñ½1½İ•É…Í” ¤ì(€½¹ÍĞ½… €ô=!}!9Mm­•åt€üüì(€€€¡•…‘½… ÈÀÈÔè€‰9½Ğ…Ù…¥±…‰±”ˆ°(€€€¡•…‘½… ÈÀÈØè€‰9½Ğ…Ù…¥±…‰±”ˆ°(€€€ÍÑ…ÑÕÌè€‰I•ÑÕÉ¹¥¹œˆ…Ì½¹ÍĞ°(€€€¹½Ñ”è€‰½…¡¥¹œ¥¹™½Éµ…Ñ¥½¸¡…Ì¹½Ğ‰••¸Ù•É¥™¥•¸ˆ°(€ôì((€É•ÑÕÉ¸ì(€€€…‰‰Èè­•ä°(€€€€¸¸¹½… °(€€€…‘‘¥Ñ¥½¹Ìè91}9=Q	1}A1eI}5=YL¹™¥±Ñ•È ¡µ½Ù”¤€ôøµ½Ù”¹Ñ¼€ôôô­•ä¤°(€€€‘•Á…ÉÑÕÉ•Ìè91}9=Q	1}A1eI}5=YL¹™¥±Ñ•È ¡µ½Ù”¤€ôøµ½Ù”¹™É½´€ôôô­•ä¤°(€€€Ù•É¥™¥•‘Ğè91}=MM=9}Q}YI%%}P°(€ôì)ô()•áÁ½ÉĞ½¹ÍĞ91}=MM=9}Q5}=U9P€ô=‰©•Ğ¹­•åÌ¡=!}!9L¤¹±•¹Ñ ì(