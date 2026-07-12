/**
 * A curated slice of real entries from https://github.com/public-apis/public-apis
 * — all no-auth, HTTPS. Each carries a behavior profile the offline
 * {@link RecordedHttpClient} replays so the Self-Harness loop is reproducible
 * without network, plus the JSON key a task uses to verify a successful call.
 *
 * The profiles mirror real friction the public-apis list is full of: endpoints
 * that are slow, that rate-limit bursts, that only answer over HTTPS (an
 * http:// hit 301-redirects), and collections that must be paged.
 */
export type ApiPathology = "healthy" | "slow" | "rate-limited" | "http-redirect" | "paginated";

export interface ApiEndpoint {
  /** Name and category as they appear in the public-apis README. */
  name: string;
  category: string;
  url: string;
  pathology: ApiPathology;
  /** Simulated round-trip latency (ms) for the recorded client. */
  latencyMs: number;
  /** 429 on the first attempt, 200 after, when true. */
  rateLimited: boolean;
  /** Reachable only over HTTPS; an unfollowed redirect fails. */
  redirects: boolean;
  /** Successful GETs the agent must make before the task is done (pagination). */
  pagesNeeded: number;
  /** A JSON key present in a successful response body. */
  expectKey: string;
  /** Sample success body the recorded client returns. */
  sampleBody: string;
}

function ep(partial: Omit<ApiEndpoint, "latencyMs" | "rateLimited" | "redirects" | "pagesNeeded">) {
  return {
    latencyMs: 40,
    rateLimited: false,
    redirects: false,
    pagesNeeded: 1,
    ...partial,
  } satisfies ApiEndpoint;
}

/** The curated endpoint set, one or two per pathology. */
export const ENDPOINTS: ApiEndpoint[] = [
  // Healthy, fast — pass under the naive harness; the gate must protect them.
  ep({
    name: "Cat Facts",
    category: "Animals",
    url: "https://catfact.ninja/fact",
    pathology: "healthy",
    expectKey: "fact",
    sampleBody: '{"fact":"Cats sleep 70% of their lives.","length":31}',
  }),
  ep({
    name: "Chuck Norris",
    category: "Entertainment",
    url: "https://api.chucknorris.io/jokes/random",
    pathology: "healthy",
    expectKey: "value",
    sampleBody: '{"id":"abc","value":"Chuck Norris counted to infinity. Twice."}',
  }),

  // Healthy but paged — needs several successful GETs; an over-tight tool-call
  // budget regresses it, which is how the gate catches an over-aggressive fix.
  {
    ...ep({
      name: "REST Countries",
      category: "Geo",
      url: "https://restcountries.com/v3.1/all",
      pathology: "paginated",
      expectKey: "name",
      sampleBody: '[{"name":{"common":"Chad"}}]',
    }),
    pagesNeeded: 4,
  },

  // Slow — times out under the naive low timeout. Fix: raise the timeout rule.
  {
    ...ep({
      name: "Agify",
      category: "ML",
      url: "https://api.agify.io?name=michael",
      pathology: "slow",
      expectKey: "age",
      sampleBody: '{"name":"michael","age":63,"count":233482}',
    }),
    latencyMs: 700,
  },
  {
    ...ep({
      name: "Advice Slip",
      category: "Text",
      url: "https://api.adviceslip.com/advice",
      pathology: "slow",
      expectKey: "slip",
      sampleBody: '{"slip":{"id":42,"advice":"Ship the smaller thing."}}',
    }),
    latencyMs: 650,
  },

  // Rate-limited — 429 on the first hit. Fix: enable retry-on-429.
  {
    ...ep({
      name: "Dog CEO",
      category: "Animals",
      url: "https://dog.ceo/api/breeds/image/random",
      pathology: "rate-limited",
      expectKey: "message",
      sampleBody: '{"message":"https://images.dog.ceo/breeds/pug/1.jpg","status":"success"}',
    }),
    rateLimited: true,
  },
  {
    ...ep({
      name: "Bored",
      category: "Games",
      url: "https://www.boredapi.com/api/activity",
      pathology: "rate-limited",
      expectKey: "activity",
      sampleBody: '{"activity":"Learn to juggle","type":"recreational"}',
    }),
    rateLimited: true,
  },

  // HTTPS-only — an http:// hit 301-redirects. Fix: follow redirects.
  {
    ...ep({
      name: "IPify",
      category: "Network",
      url: "http://api.ipify.org?format=json",
      pathology: "http-redirect",
      expectKey: "ip",
      sampleBody: '{"ip":"203.0.113.7"}',
    }),
    redirects: true,
  },
  {
    ...ep({
      name: "Open-Meteo",
      category: "Weather",
      url: "http://api.open-meteo.com/v1/forecast?latitude=52.5&longitude=13.4&current_weather=true",
      pathology: "http-redirect",
      expectKey: "current_weather",
      sampleBody: '{"current_weather":{"temperature":12.3,"windspeed":8.1}}',
    }),
    redirects: true,
  },
];

/** Look up an endpoint by URL. */
export function endpointByUrl(url: string): ApiEndpoint | undefined {
  return ENDPOINTS.find((e) => e.url === url);
}
