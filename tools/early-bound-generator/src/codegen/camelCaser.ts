const PREFERRED_WORDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    ["For", new Set(["Fort"])],
    ["In", new Set(["Tin", "Bin", "Sin"])],
    ["Team", new Set(["Steam"])],
    ["Sent", new Set(["Ent"])],
    ["Set", new Set(["Et"])],
    ["Side", new Set(["Ide"])],
]);

export class CamelCaser {
    private readonly dict: Map<number, Set<string>>;

    private readonly overrides: string[];
    private readonly maxWordLength: number;

    private readonly cacheForward = new Map<string, string>();
    private readonly cacheBackward = new Map<string, string>();

    constructor(dict: Map<number, Set<string>>, overrides: string[] = []) {
        this.dict = dict;
        this.overrides = overrides;
        this.maxWordLength = dict.size > 0 ? Math.max(...dict.keys()) : 0;
    }

    caseWord(value: string, preferredEndings: string[] = ["Guid", "Id"]): string {
        const lower = value.toLowerCase();
        const backward = this.caseWordDir(lower, preferredEndings, false);
        const forward = this.caseWordDir(lower, preferredEndings, true);
        return this.chooseBest(backward, forward);
    }

    private caseWordDir(value: string, preferredEndings: string[], forward: boolean): string {
        for (const ending of preferredEndings) {
            if (value.endsWith(ending.toLowerCase())) {
                const stem = value.slice(0, value.length - ending.length);
                const withoutEnding = this.caseInternal(stem, forward);
                const withEnding = this.caseInternal(value, forward);
                const countA = countUpper(withoutEnding);
                const countB = countUpper(withEnding);
                return countA < countB ? withoutEnding + ending : withEnding;
            }
        }
        return this.caseInternal(value, forward);
    }

    private chooseBest(a: string, b: string): string {
        const ca = countUpper(a);
        const cb = countUpper(b);
        if (ca !== cb) return ca < cb ? a : b;
        return this.parseForLongerWords(a, b);
    }

    private parseForLongerWords(a: string, b: string): string {
        const wa = extractWords(a);
        const wb = extractWords(b);

        if (wa.length !== wb.length) return wa.length > wb.length ? a : b;

        for (let i = 0; i < wa.length; i++) {
            const preferred = PREFERRED_WORDS.get(wa[i]);
            if (preferred?.has(wb[i])) return a;
            const preferredB = PREFERRED_WORDS.get(wb[i]);
            if (preferredB?.has(wa[i])) return b;
        }

        const ga = groupByLength(wa);
        const gb = groupByLength(wb);
        for (let i = 0; i < ga.length && i < gb.length; i++) {
            if (ga[i].len > gb[i].len) return a;
            if (ga[i].len < gb[i].len) return b;
            if (ga[i].count > gb[i].count) return a;
            if (gb[i].count > ga[i].count) return b;
        }

        return a;
    }

    private caseInternal(value: string, forward: boolean): string {
        for (const token of this.overrides) {
            const idx = value.indexOf(token.toLowerCase());
            if (idx >= 0) {
                const start = idx === 0 ? "" : this.caseInternal(value.slice(0, idx), forward);
                const end = idx + token.length === value.length ? "" : this.caseInternal(value.slice(idx + token.length), forward);
                return start + token + end;
            }
        }

        if (value.includes("_")) {
            return value
                .split("_")
                .map((p) => this.casePart(p, forward))
                .join("_");
        }

        return this.casePart(value, forward);
    }

    private casePart(part: string, forward: boolean): string {
        const cache = forward ? this.cacheForward : this.cacheBackward;
        const cached = cache.get(part);
        if (cached !== undefined) return cached;
        const result = this.casePartCore(part, forward);
        cache.set(part, result);
        return result;
    }

    private casePartCore(part: string, forward: boolean): string {
        if (!part) return "";
        if (part.length === 1) return part.toUpperCase();

        const maxLen = Math.min(part.length, this.maxWordLength);

        let fallback: { word: string; remaining: string; index: number } | null = null;

        for (let length = maxLen; length >= 1; length--) {
            const bucket = this.dict.get(length);
            if (!bucket) continue;

            const word = forward ? part.slice(0, length) : part.slice(part.length - length);
            if (!bucket.has(word)) continue;

            const remaining = this.caseRemaining(part, word, forward);
            const badIndex = firstNonWordPartIndex(remaining);

            if (badIndex >= 0) {
                if (fallback === null || badIndex < fallback.index) {
                    fallback = { word, remaining, index: badIndex };
                }
                continue;
            }

            return forward ? capitalise(word) + remaining : remaining + capitalise(word);
        }

        if (fallback !== null) {
            return forward ? capitalise(fallback.word) + fallback.remaining : fallback.remaining + capitalise(fallback.word);
        }

        if (forward) {
            return part[0].toUpperCase() + this.casePart(part.slice(1), forward);
        }
        const last = part[part.length - 1];
        return this.casePart(part.slice(0, -1), forward) + last.toUpperCase();
    }

    private caseRemaining(whole: string, word: string, forward: boolean): string {
        if (whole.length === word.length) return "";
        const remaining = forward ? whole.slice(word.length) : whole.slice(0, whole.length - word.length);
        return remaining.length < 2 ? capitalise(remaining) : this.casePart(remaining, forward);
    }
}

function capitalise(word: string): string {
    if (!word) return word;
    return word[0].toUpperCase() + word.slice(1);
}

function countUpper(s: string): number {
    let n = 0;
    for (const ch of s) if (ch >= "A" && ch <= "Z") n++;
    return n;
}

function extractWords(s: string): string[] {
    return Array.from(s.matchAll(/([A-Z][a-z]+)/g), (m) => m[1]);
}

function groupByLength(words: string[]): { len: number; count: number }[] {
    const map = new Map<number, number>();
    for (const w of words) map.set(w.length, (map.get(w.length) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([len, count]) => ({ len, count }));
}

function firstNonWordPartIndex(s: string): number {
    for (let i = 0; i < s.length - 1; i++) {
        if (s[i] >= "A" && s[i] <= "Z" && s[i + 1] >= "A" && s[i + 1] <= "Z") return i;
    }
    return -1;
}

export function buildDictionary(rawText: string, customWords: string[] = []): Map<number, Set<string>> {
    const dict = new Map<number, Set<string>>();

    const addWord = (raw: string) => {
        const w = raw.trim().toLowerCase();
        if (!w) return;
        let bucket = dict.get(w.length);
        if (!bucket) {
            bucket = new Set();
            dict.set(w.length, bucket);
        }
        bucket.add(w);
    };

    for (const line of rawText.split("\n")) addWord(line);
    for (const word of customWords) addWord(word);

    return dict;
}
