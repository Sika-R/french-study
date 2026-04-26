/**
 * 法语时态/语式登记表，主进程和渲染端共享。
 *
 * Verbiste 命名约定：
 *   mode = indicative / conditional / subjunctive / imperative / participle / infinitive
 *   tense = present / imperfect / future / simple-past / present-participle / past-participle
 *
 * 我们暴露的"10 种简单时态"清单（按教学常用顺序）：
 *   1. 直陈式现在        indicative.present
 *   2. 直陈式未完成过去  indicative.imperfect
 *   3. 直陈式简单过去    indicative.simple-past
 *   4. 直陈式简单将来    indicative.future
 *   5. 条件式现在        conditional.present
 *   6. 虚拟式现在        subjunctive.present
 *   7. 虚拟式未完成过去  subjunctive.imperfect
 *   8. 命令式            imperative.present     (只 tu/nous/vous)
 *   9. 现在分词          participle.present-participle  (无人称)
 *  10. 过去分词          participle.past-participle     (无人称)
 *
 * 复合时态（passé composé / plus-que-parfait 等）这一版不做。
 */

export interface TenseDef {
  id: string;            // 'indicative.present'
  mode: string;
  tense: string;
  zh: string;            // 中文名
  fr: string;            // 法语名（可选）
  persons: number[];     // 该时态需要的人称下标 (1..6)；空数组 = 无人称
}

export const PERSONS_FULL = [1, 2, 3, 4, 5, 6];           // je, tu, il, nous, vous, ils
export const PERSONS_IMPERATIVE = [2, 4, 5];               // tu, nous, vous
export const PERSON_LABELS: Record<number, string> = {
  1: 'je / j’',
  2: 'tu',
  3: 'il / elle / on',
  4: 'nous',
  5: 'vous',
  6: 'ils / elles'
};

export const TENSES: TenseDef[] = [
  { id: 'indicative.present',           mode: 'indicative',  tense: 'present',           zh: '直陈式现在时',         fr: 'indicatif présent',         persons: PERSONS_FULL },
  { id: 'indicative.imperfect',         mode: 'indicative',  tense: 'imperfect',         zh: '直陈式未完成过去时',   fr: 'indicatif imparfait',       persons: PERSONS_FULL },
  { id: 'indicative.simple-past',       mode: 'indicative',  tense: 'simple-past',       zh: '直陈式简单过去时',     fr: 'passé simple',              persons: PERSONS_FULL },
  { id: 'indicative.future',            mode: 'indicative',  tense: 'future',            zh: '直陈式简单将来时',     fr: 'futur simple',              persons: PERSONS_FULL },
  { id: 'conditional.present',          mode: 'conditional', tense: 'present',           zh: '条件式现在时',         fr: 'conditionnel présent',      persons: PERSONS_FULL },
  { id: 'subjunctive.present',          mode: 'subjunctive', tense: 'present',           zh: '虚拟式现在时',         fr: 'subjonctif présent',        persons: PERSONS_FULL },
  { id: 'subjunctive.imperfect',        mode: 'subjunctive', tense: 'imperfect',         zh: '虚拟式未完成过去时',   fr: 'subjonctif imparfait',      persons: PERSONS_FULL },
  { id: 'imperative.present',           mode: 'imperative',  tense: 'present',           zh: '命令式',               fr: 'impératif',                 persons: PERSONS_IMPERATIVE },
  { id: 'participle.present-participle',mode: 'participle',  tense: 'present-participle',zh: '现在分词',             fr: 'participe présent',         persons: [] },
  { id: 'participle.past-participle',   mode: 'participle',  tense: 'past-participle',   zh: '过去分词',             fr: 'participe passé',           persons: [] }
];

export function tenseById(id: string): TenseDef | undefined {
  return TENSES.find(t => t.id === id);
}
