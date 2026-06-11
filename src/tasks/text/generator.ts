// 文書入力課題の問題生成（レベル1〜10）
// ・テンプレート＋語彙プールからランダム合成（固定問題集にしない）
// ・ビジネス文書風の無難な内容のみ。実在の固有名詞・個人名は使わない
//   （社名は「株式会社サンプル商事」のような明らかな架空名のみ）
// ・全ての漢字語に読みを持たせ、採点側の「変換誤り」検出（読み一致判定）に使う
//
// 自然さの担保ルール：
// ・語彙プールは「その動詞・文型と組み合わせて自然な語」だけで構成する
//   （例：「つかいます」プールに「おちゃ」を入れない）
// ・同一文内で同じプールから2回選ぶ場合は重複しない語を選ぶ
// ・「以上、よろしく〜」等の締め文は文章の末尾にのみ使う

import type { RNG } from '../../engine/rng';
import { pick, randInt } from '../../engine/rng';

export interface TextProblem {
  level: number;
  text: string;
}

type Tok = readonly [string, string]; // [表記, 読み（ひらがな）]
interface PoolWord {
  s: string;
  r: string;
  /** 同じ読みの別語（IME変換誤りとして実際に起こりうる実在語） */
  h?: string[];
}

// 表記→読みの辞書。モジュール初期化時にテンプレート・プールから自動収集する
const DICT_ENTRIES: [string, string][] = [];
const REGISTERED = new Set<string>();

function reg(s: string, r: string): void {
  if (s === r) return;
  const key = s + '|' + r;
  if (REGISTERED.has(key)) return;
  REGISTERED.add(key);
  DICT_ENTRIES.push([s, r]);
}

type Part = { lit: Tok } | { pool: PoolWord[] } | { int: [number, number] };
type Template = Part[];

/** リテラル部品（読み省略時は表記＝読み） */
function L(s: string, r?: string): Part {
  const rr = r ?? s;
  reg(s, rr);
  return { lit: [s, rr] };
}

function regPool(words: PoolWord[]): PoolWord[] {
  for (const w of words) {
    reg(w.s, w.r);
    for (const h of w.h ?? []) reg(h, w.r);
  }
  return words;
}

const P = (pool: PoolWord[]): Part => ({ pool });
const N = (min: number, max: number): Part => ({ int: [min, max] });

// ---- 語彙プール（動詞・文型との相性で分ける） ----

// 「かいます」が自然な物
const W_BUY_ITEM = regPool([
  { s: 'えんぴつ', r: 'えんぴつ' },
  { s: 'けしごむ', r: 'けしごむ' },
  { s: 'ふうとう', r: 'ふうとう' },
  { s: 'はがき', r: 'はがき' },
  { s: 'おちゃ', r: 'おちゃ' },
  { s: 'てちょう', r: 'てちょう' },
]);

// 「つかいます」が自然な物（飲食物は入れない）
const W_USE_ITEM = regPool([
  { s: 'えんぴつ', r: 'えんぴつ' },
  { s: 'けしごむ', r: 'けしごむ' },
  { s: 'てちょう', r: 'てちょう' },
]);

const W_TENKI_HIRA = regPool([
  { s: 'はれ', r: 'はれ' },
  { s: 'あめ', r: 'あめ' },
  { s: 'くもり', r: 'くもり' },
]);

const W_TENKI = regPool([
  { s: '晴れ', r: 'はれ' },
  { s: '雨', r: 'あめ' },
  { s: 'くもり', r: 'くもり' },
]);

const W_HIRA_PLACE = regPool([
  { s: 'うけつけ', r: 'うけつけ' },
  { s: 'じむしょ', r: 'じむしょ' },
  { s: 'しょくどう', r: 'しょくどう' },
]);

const W_YOUBI = regPool([
  { s: '月曜日', r: 'げつようび' },
  { s: '火曜日', r: 'かようび' },
  { s: '水曜日', r: 'すいようび' },
  { s: '木曜日', r: 'もくようび' },
  { s: '金曜日', r: 'きんようび' },
]);

const W_YOUBI1 = regPool([
  { s: '月', r: 'げつ' },
  { s: '火', r: 'か' },
  { s: '水', r: 'すい' },
  { s: '木', r: 'もく' },
  { s: '金', r: 'きん' },
]);

// 場所（汎用：会合・そうじ・案内表示など）
const W_PLACE = regPool([
  { s: '会議室', r: 'かいぎしつ' },
  { s: '事務所', r: 'じむしょ' },
  { s: '受付', r: 'うけつけ' },
  { s: '資料室', r: 'しりょうしつ' },
  { s: '倉庫', r: 'そうこ' },
  { s: '食堂', r: 'しょくどう' },
]);

// 書類の届け先・置き場所として自然な場所
const W_PLACE_OFFICE = regPool([
  { s: '会議室', r: 'かいぎしつ' },
  { s: '事務所', r: 'じむしょ' },
  { s: '受付', r: 'うけつけ' },
  { s: '資料室', r: 'しりょうしつ' },
]);

// 保管・荷物運びの行き先として自然な場所
const W_STORE = regPool([
  { s: '資料室', r: 'しりょうしつ' },
  { s: '倉庫', r: 'そうこ' },
  { s: '事務所', r: 'じむしょ' },
]);

const W_DOC = regPool([
  { s: '請求書', r: 'せいきゅうしょ' },
  { s: '納品書', r: 'のうひんしょ' },
  { s: '見積書', r: 'みつもりしょ' },
  { s: '報告書', r: 'ほうこくしょ' },
  { s: '申込書', r: 'もうしこみしょ' },
]);

// 会合に持っていく物として自然な書類
const W_BRING = regPool([
  { s: '資料', r: 'しりょう' },
  { s: '報告書', r: 'ほうこくしょ' },
  { s: '予定表', r: 'よていひょう' },
]);

// 機器（使い方を教わる・点検する・大切に使う）
const W_MACHINE = regPool([
  { s: 'コピー機', r: 'こぴーき' },
  { s: 'プリンター', r: 'ぷりんたー' },
  { s: 'パソコン', r: 'ぱそこん' },
]);

// 持ち運べる物（運ぶ・持ち物・元に戻す）
const W_PORTABLE = regPool([
  { s: 'ファイル', r: 'ふぁいる' },
  { s: 'カタログ', r: 'かたろぐ' },
  { s: 'ノート', r: 'のーと' },
]);

// 印刷できるもの
const W_PRINTABLE = regPool([
  { s: 'データ', r: 'でーた' },
  { s: 'スケジュール', r: 'すけじゅーる' },
  { s: 'ファイル', r: 'ふぁいる' },
]);

// 置き場所が変わりうる物
const W_KATA_PHYS = [...W_MACHINE, ...W_PORTABLE];

// 案内文に対して自然な動作
const W_ACT_DOC = regPool([
  { s: '確認', r: 'かくにん' },
  { s: '印刷', r: 'いんさつ' },
  { s: '準備', r: 'じゅんび' },
]);

const W_DEPT = regPool([
  { s: '総務課', r: 'そうむか' },
  { s: '経理課', r: 'けいりか' },
  { s: '営業課', r: 'えいぎょうか' },
  { s: '製造課', r: 'せいぞうか' },
]);

const W_EVENT = regPool([
  { s: '打ち合わせ', r: 'うちあわせ' },
  { s: '連絡会', r: 'れんらくかい' },
  { s: '研修', r: 'けんしゅう' },
  { s: '朝礼', r: 'ちょうれい' },
  { s: '説明会', r: 'せつめいかい' },
]);

const W_GOODS = regPool([
  { s: '部品', r: 'ぶひん' },
  { s: '商品', r: 'しょうひん' },
  { s: '資材', r: 'しざい' },
  { s: '文具', r: 'ぶんぐ' },
]);

const W_COMPANY = regPool([
  { s: '株式会社サンプル商事', r: 'かぶしきがいしゃさんぷるしょうじ' },
  { s: 'テスト株式会社', r: 'てすとかぶしきがいしゃ' },
  { s: '見本工業株式会社', r: 'みほんこうぎょうかぶしきがいしゃ' },
]);

// 変換誤りが実際に起こりやすい同音異義語（h に実在語のみを列挙）
const W_KAITOU = regPool([{ s: '回答', r: 'かいとう', h: ['解答'] }]);
const W_IDOU = regPool([{ s: '異動', r: 'いどう', h: ['移動'] }]);
const W_KIKAI = regPool([{ s: '機会', r: 'きかい', h: ['機械', '器械'] }]);
const W_YOUKEN = regPool([{ s: '要件', r: 'ようけん', h: ['用件'] }]);
const W_HOSHOU = regPool([{ s: '保証', r: 'ほしょう', h: ['保障', '補償'] }]);
const W_SHOUKAI = regPool([{ s: '照会', r: 'しょうかい', h: ['紹介'] }]);
const W_SEISAN = regPool([{ s: '精算', r: 'せいさん', h: ['清算', '生産'] }]);
const W_TAISHOU = regPool([{ s: '対象', r: 'たいしょう', h: ['対称', '対照'] }]);

// ---- テンプレート（バンド別） ----

// L1: ひらがなのみの短文
const BAND_A1: Template[] = [
  [P(W_BUY_ITEM), L('をかいます。')],
  [P(W_USE_ITEM), L('をつかいます。')],
  [L('きょうは'), P(W_TENKI_HIRA), L('です。')],
  [L('あしたはやすみです。')],
  [P(W_HIRA_PLACE), L('にいきます。')],
];

// L2: かんたんな漢字
const BAND_A2: Template[] = [
  [L('今日', 'きょう'), L('の'), L('天気', 'てんき'), L('は'), P(W_TENKI), L('です。')],
  [P(W_YOUBI), L('に'), L('仕事', 'しごと'), L('があります。')],
  [L('お茶', 'おちゃ'), L('を'), L('三', 'さん'), L('本', 'ほん'), L('買います。', 'かいます。')],
  [P(W_PLACE_OFFICE), L('で'), L('待って', 'まって'), L('います。')],
  [L('午後', 'ごご'), L('から'), L('作業', 'さぎょう'), L('をします。')],
];

// L3: 日常の漢字・1文
const BAND_B: Template[] = [
  [P(W_DOC), L('を'), P(W_PLACE_OFFICE), L('に'), L('届けて', 'とどけて'), L('ください。')],
  [P(W_YOUBI), L('までに'), P(W_DOC), L('を'), L('作ります。', 'つくります。')],
  [P(W_PLACE), L('の'), L('机', 'つくえ'), L('といすを'), L('片づけて', 'かたづけて'), L('ください。')],
  [L('使った', 'つかった'), L('道具', 'どうぐ'), L('は'), L('元', 'もと'), L('の'), L('場所', 'ばしょ'), L('に'), L('戻します。', 'もどします。')],
];

// L4: 句読点（読点）のある1文
const BAND_B4: Template[] = [
  [
    P(W_YOUBI), L('の'), L('朝', 'あさ'), L('、'), P(W_PLACE), L('で'), P(W_EVENT),
    L('がありますので、おくれないようにしてください。'),
  ],
  [L('仕事', 'しごと'), L('が'), L('終わったら', 'おわったら'), L('、'), P(W_DOC), L('を'), P(W_PLACE_OFFICE), L('に'), L('戻して', 'もどして'), L('ください。')],
  [L('明日', 'あした'), L('の'), L('作業', 'さぎょう'), L('は、'), L('雨', 'あめ'), L('の'), L('場合', 'ばあい'), L('、'), L('翌日', 'よくじつ'), L('にします。')],
  [L('昼休み', 'ひるやすみ'), L('のあとに、'), P(W_PLACE), L('のそうじをします。')],
];

// L5: カタカナ語まじり（動詞との相性で対象プールを使い分け）
const BAND_C: Template[] = [
  [L('新しい', 'あたらしい'), P(W_MACHINE), L('の'), L('使い方', 'つかいかた'), L('を'), L('教わります', 'おそわります'), L('。')],
  [P(W_KATA_PHYS), L('の'), L('置き場所', 'おきばしょ'), L('が'), L('変わりました', 'かわりました'), L('。')],
  [P(W_PRINTABLE), L('を'), L('印刷', 'いんさつ'), L('して、'), L('終わったら', 'おわったら'), L('報告', 'ほうこく'), L('してください。')],
  [P(W_PORTABLE), L('と'), P(W_PORTABLE), L('を'), P(W_PLACE_OFFICE), L('に'), L('運んで', 'はこんで'), L('ください。')],
  [P(W_MACHINE), L('は'), L('大切', 'たいせつ'), L('に'), L('使って', 'つかって'), L('ください。')],
];

// L6: 日付・数字（半角）まじり
const BAND_D: Template[] = [
  [
    N(1, 12), L('月', 'がつ'), N(1, 28), L('日', 'にち'), L('（'), P(W_YOUBI1), L('）'), L('の'),
    N(9, 17), L('時', 'じ'), L('から、'), P(W_PLACE), L('で'), P(W_EVENT), L('を'), L('行います', 'おこないます'), L('。'),
  ],
  [P(W_DOC), L('を'), N(2, 9), L('部', 'ぶ'), L('コピーして、'), P(W_PLACE_OFFICE), L('に'), L('置いて', 'おいて'), L('ください。')],
  [L('締め切り', 'しめきり'), L('は'), N(1, 12), L('月', 'がつ'), N(1, 28), L('日', 'にち'), L('の'), N(9, 17), L('時', 'じ'), L('です。')],
  [N(2, 9), L('階', 'かい'), L('の'), P(W_STORE), L('に'), P(W_GOODS), L('を'), N(2, 9), L('箱', 'はこ'), L('運びます', 'はこびます'), L('。')],
];

// L7: 記号（中黒・括弧）まじり
const BAND_E: Template[] = [
  [L('持ち物', 'もちもの'), L('は、'), L('筆記用具', 'ひっきようぐ'), L('・'), P(W_PORTABLE), L('・'), P(W_BRING), L('の3'), L('点', 'てん'), L('です。')],
  [P(W_EVENT), L('（'), N(1, 12), L('月', 'がつ'), N(1, 28), L('日', 'にち'), L('）'), L('の'), L('案内', 'あんない'), L('を'), P(W_ACT_DOC), L('してください。')],
  [P(W_TAISHOU), L('は'), P(W_DEPT), L('・'), P(W_DEPT), L('のみなさんです。')],
  [L('場所', 'ばしょ'), L('は'), N(2, 9), L('階', 'かい'), L('（'), P(W_PLACE), L('のとなり）です。')],
];

// L8: 同音異義語を含むビジネス短文
const BAND_F: Template[] = [
  [L('アンケートの'), P(W_KAITOU), L('を'), N(1, 12), L('月', 'がつ'), N(1, 28), L('日', 'にち'), L('までに'), L('提出', 'ていしゅつ'), L('してください。')],
  [L('人事', 'じんじ'), P(W_IDOU), L('のお'), L('知らせ', 'しらせ'), L('を'), L('掲示板', 'けいじばん'), L('に'), L('貼ります', 'はります'), L('。')],
  [L('申請', 'しんせい'), L('の'), P(W_YOUKEN), L('を'), L('事前', 'じぜん'), L('に'), L('確認', 'かくにん'), L('してください。')],
  [L('在庫', 'ざいこ'), L('を'), P(W_SHOUKAI), L('し、'), L('結果', 'けっか'), L('を'), L('報告', 'ほうこく'), L('してください。')],
  [L('経費', 'けいひ'), L('の'), P(W_SEISAN), L('は'), L('今週中', 'こんしゅうちゅう'), L('にお'), L('願い', 'ねがい'), L('します。')],
  [L('品質', 'ひんしつ'), P(W_HOSHOU), L('の'), L('書類', 'しょるい'), L('を'), P(W_STORE), L('に'), L('保管', 'ほかん'), L('します。')],
  [P(W_KIKAI), L('があれば、'), L('新しい', 'あたらしい'), P(W_MACHINE), L('も'), L('試して', 'ためして'), L('ください。')],
];

// L9〜10: 長めの複文（ビジネス文書風）
const BAND_G: Template[] = [
  [
    P(W_COMPANY), L('より'), P(W_GOODS), L('の'), L('注文', 'ちゅうもん'), L('がありましたので、'),
    L('納品書', 'のうひんしょ'), L('を'), L('作成', 'さくせい'), L('して'), L('送って', 'おくって'), L('ください。'),
  ],
  [
    P(W_COMPANY), L('から'), P(W_DOC), L('について'), P(W_SHOUKAI), L('がありましたので、'),
    L('内容', 'ないよう'), L('を'), L('確認', 'かくにん'), L('して'), N(1, 12), L('月', 'がつ'), N(1, 28), L('日', 'にち'),
    L('までに'), P(W_KAITOU), L('してください。'),
  ],
  [
    N(1, 12), L('月', 'がつ'), N(1, 28), L('日', 'にち'), L('（'), P(W_YOUBI1), L('）'), L('の'), N(9, 17), L('時', 'じ'),
    L('から'), P(W_PLACE), L('で'), P(W_EVENT), L('を'), L('行います', 'おこないます'), L('ので、'),
    P(W_BRING), L('と'), L('筆記用具', 'ひっきようぐ'), L('を'), L('持って', 'もって'), L('集まって', 'あつまって'), L('ください。'),
  ],
  [
    L('作業', 'さぎょう'), L('が'), L('終わったら', 'おわったら'), L('、'), L('使った', 'つかった'), P(W_PORTABLE),
    L('を'), L('元', 'もと'), L('の'), L('場所', 'ばしょ'), L('に'), L('戻し', 'もどし'), L('、'),
    L('数', 'かず'), L('が'), L('合って', 'あって'), L('いるか'), L('確認', 'かくにん'), L('してください。'),
  ],
  [
    P(W_DEPT), L('の'), P(W_EVENT), L('は'), L('都合', 'つごう'), L('により'), N(1, 12), L('月', 'がつ'),
    N(1, 28), L('日', 'にち'), L('（'), P(W_YOUBI1), L('）'), L('に'), L('変更', 'へんこう'), L('になりましたので、'),
    L('予定表', 'よていひょう'), L('を'), L('直して', 'なおして'), L('ください。'),
  ],
];

// 締めの文（文章の末尾にのみ使う）
const CLOSERS: Template[] = [
  [L('ご'), L('不明', 'ふめい'), L('な'), L('点', 'てん'), L('は、'), L('受付', 'うけつけ'), L('までお'), L('知らせ', 'しらせ'), L('ください。')],
  [L('以上', 'いじょう'), L('、よろしくお'), L('願い', 'ねがい'), L('します。')],
];

// ---- レベル設定 ----

interface TextLvCfg {
  minLen: number;
  maxLen: number;
  minS: number;
  maxS: number;
  bands: Template[][];
  closers?: Template[];
}

const LV: TextLvCfg[] = [
  { minLen: 8, maxLen: 16, minS: 1, maxS: 1, bands: [BAND_A1] }, // L1
  { minLen: 9, maxLen: 20, minS: 1, maxS: 1, bands: [BAND_A2] }, // L2
  { minLen: 13, maxLen: 28, minS: 1, maxS: 1, bands: [BAND_B] }, // L3
  { minLen: 18, maxLen: 40, minS: 1, maxS: 1, bands: [BAND_B4] }, // L4
  { minLen: 26, maxLen: 55, minS: 1, maxS: 2, bands: [BAND_C] }, // L5
  { minLen: 30, maxLen: 65, minS: 1, maxS: 2, bands: [BAND_D, BAND_C] }, // L6
  { minLen: 40, maxLen: 85, minS: 2, maxS: 3, bands: [BAND_E, BAND_D] }, // L7
  { minLen: 45, maxLen: 110, minS: 2, maxS: 3, bands: [BAND_F, BAND_E], closers: CLOSERS }, // L8
  { minLen: 80, maxLen: 150, minS: 3, maxS: 4, bands: [BAND_F, BAND_D, BAND_G], closers: CLOSERS }, // L9
  { minLen: 130, maxLen: 210, minS: 3, maxS: 4, bands: [BAND_G, BAND_G, BAND_F], closers: CLOSERS }, // L10
];

export const TEXT_LEVEL_SUMMARIES = [
  'ひらがなの短い文（10字ほど）',
  'かんたんな漢字の文（15字ほど）',
  '日常の漢字の文（20字ほど）',
  '句読点のある文（30字ほど）',
  'カタカナ語まじりの文（40字ほど）',
  '日付・数字まじりの文（50字ほど）',
  '記号まじりの文（60〜80字）',
  '2〜3文の文章（60〜110字）',
  '3文前後の文章（80〜150字）',
  '3〜4文のビジネス文書（130〜210字）',
];

function instantiate(tpl: Template, rng: RNG): string {
  let s = '';
  const used = new Set<string>();
  for (const part of tpl) {
    if ('lit' in part) {
      s += part.lit[0];
    } else if ('pool' in part) {
      // 同一文内の重複語を避ける（例：「ファイルとファイル」「総務課・総務課」）
      const avail = part.pool.filter((w) => !used.has(w.s));
      const w = pick(rng, avail.length > 0 ? avail : part.pool);
      used.add(w.s);
      s += w.s;
    } else {
      s += String(randInt(rng, part.int[0], part.int[1]));
    }
  }
  return s;
}

export function generateText(level: number, rng: RNG): TextProblem {
  const lv = Math.max(1, Math.min(10, Math.round(level)));
  const cfg = LV[lv - 1];
  const allTemplates = cfg.bands.flat();
  let candidate = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    const n = randInt(rng, cfg.minS, cfg.maxS);
    const useCloser = !!cfg.closers && n >= 3 && rng() < 0.4;
    const bodyCount = useCloser ? n - 1 : n;
    let text = '';
    const usedTpl = new Set<Template>();
    for (let i = 0; i < bodyCount; i++) {
      // 1問内で同じテンプレートを繰り返さない（文の重複防止）
      const avail = allTemplates.filter((t) => !usedTpl.has(t));
      const tpl = pick(rng, avail.length > 0 ? avail : allTemplates);
      usedTpl.add(tpl);
      text += instantiate(tpl, rng);
    }
    if (useCloser && cfg.closers) {
      text += instantiate(pick(rng, cfg.closers), rng);
    }
    candidate = text;
    if (text.length >= cfg.minLen && text.length <= cfg.maxLen) {
      return { level: lv, text };
    }
  }
  return { level: lv, text: candidate }; // まれに範囲外でも採用（無限ループ防止）
}

// ---- 読み形への変換（変換誤り検出用） ----

let dictIndex: Map<string, [string, string][]> | null = null;

function getDictIndex(): Map<string, [string, string][]> {
  if (!dictIndex) {
    dictIndex = new Map();
    for (const [s, r] of DICT_ENTRIES) {
      const arr = dictIndex.get(s[0]) ?? [];
      arr.push([s, r]);
      dictIndex.set(s[0], arr);
    }
    for (const arr of dictIndex.values()) arr.sort((a, b) => b[0].length - a[0].length);
  }
  return dictIndex;
}

function kataToHira(c: string): string {
  const code = c.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : c;
}

/**
 * 文章を「読み形」（辞書語を読みに置換・カタカナをひらがな化）に変換する。
 * 言語学的に正しい読みである必要はなく、見本と入力に同じ手続きを
 * 適用したときに一致するかどうかだけを利用する。
 */
export function toReadingForm(text: string): string {
  const idx = getDictIndex();
  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    const cands = idx.get(text[i]);
    if (cands) {
      for (const [s, r] of cands) {
        if (text.startsWith(s, i)) {
          out += r;
          i += s.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      out += kataToHira(text[i]);
      i += 1;
    }
  }
  return out;
}

/** 1問あたりの標準所要時間の目安（秒） */
export function textStdSeconds(level: number): number {
  const mid = [12, 15, 20, 29, 40, 48, 62, 78, 115, 170];
  return Math.round(8 + mid[Math.max(1, Math.min(10, level)) - 1] / 1.1);
}
