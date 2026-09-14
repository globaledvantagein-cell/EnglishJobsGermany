// Per-city intro prose for the /city/[city] SEO pages.
//
// The cities we actually rank for get their own hand-written copy, keyed to the
// queries Search Console shows them competing on. Everything else falls back to
// a short generic line: with 90+ city pages, near-duplicate boilerplate is what
// gets the whole set filtered out of the index, so a thin-but-honest page beats
// a padded one that reads like its 89 siblings.
//
// Each entry returns an array of paragraphs, rendered as separate <p>s.

/** Formats a company list as "A, B and C"; empty string if there are none. */
function companyList(companies: string[]): string {
  if (companies.length === 0) return '';
  if (companies.length === 1) return companies[0];
  return `${companies.slice(0, -1).join(', ')} and ${companies[companies.length - 1]}`;
}

type IntroFn = (count: number, companies: string) => string[];

const CITY_INTROS: Record<string, IntroFn> = {
  // Targets "english speaking jobs berlin", "english jobs in berlin",
  // "jobs in berlin without german".
  berlin: (count, companies) => [
    `Berlin is Germany's startup capital and the most English-friendly city in the country for international professionals. With ${count}+ English-speaking jobs in Berlin on this page, the city offers more opportunities than anywhere else in Germany for people who don't speak the language. From tech startups around Kreuzberg and Neukölln to corporate offices in Mitte, you can find jobs in Berlin without German across software engineering, product management, marketing, data and design.`,
    `Berlin's English-speaking job market is built on the city's international workforce — in many teams here English is simply the working language rather than a concession. ${companies ? `Employers currently hiring include ${companies}. ` : ''}Whether you already live in Berlin or are planning to relocate, every role listed is verified before it is published, so these are jobs in Berlin with no German required — not listings that quietly expect fluent German by the interview stage.`,
    `Salaries in Berlin sit below Munich and Frankfurt, but so do rents, and the city's non-German-speaking population is large enough that landlords, banks and the Bürgeramt are used to dealing in English. Most listings here are permanent, full-time roles at companies that will sponsor an EU Blue Card, which is the usual route for non-EU candidates moving to Berlin.`,
  ],

  // Targets "english jobs frankfurt", "english speaking jobs in frankfurt
  // germany", "jobs in frankfurt without german".
  frankfurt: (count, companies) => [
    `Frankfurt am Main is Germany's financial capital and one of its strongest hubs for English-speaking professionals. As the home of the European Central Bank, the Bundesbank and hundreds of international banks and corporates, Frankfurt carries ${count}+ English-speaking jobs across finance, consulting, technology, law and operations. Find English-speaking jobs in Frankfurt that don't require German — from banking and insurance through to the fintech scene around the Westend and Ostend.`,
    `The city's international business community means many Frankfurt employers operate entirely in English, which makes it an unusually good destination for expats and international professionals looking for jobs in Frankfurt without German. ${companies ? `Companies hiring right now include ${companies}. ` : ''}Frankfurt English jobs also come with the country's densest transport links: the airport and the ICE network put most of Germany within a few hours, which matters when your team or clients are spread across Europe.`,
    `Pay is high — Frankfurt's finance and consulting salaries are among the best in Germany — and the city is compact, so commutes are short compared with Berlin or Hamburg. For non-EU applicants, the large banks and consultancies here handle EU Blue Card sponsorship routinely, which makes Frankfurt one of the more predictable German cities to relocate into on an English-speaking contract.`,
  ],

  // Targets "jobs in hamburg without german", "english jobs in hamburg",
  // "english speaking jobs hamburg".
  hamburg: (count, companies) => [
    `Hamburg is Germany's media, logistics and e-commerce capital, and a port city that has hired internationally for centuries. There are ${count}+ English-speaking jobs in Hamburg listed here, spanning software engineering, marketing and content, supply chain and logistics, e-commerce and customer-facing roles. If you are looking for jobs in Hamburg without German, this is where the city's international employers concentrate.`,
    `The e-commerce and digital-media companies clustered around HafenCity and Altona run English-language teams as standard, and Hamburg's shipping and trade businesses have always worked across languages and borders. ${companies ? `Employers currently listing roles include ${companies}. ` : ''}Every English-speaking Hamburg job on this page is checked before publication to confirm German fluency is not a hard requirement, so you are not left filtering out false positives yourself.`,
    `Hamburg pays close to the national average while staying cheaper than Munich, and the city consistently ranks among Germany's best for quality of life — the Alster, the harbour and the green belt are a large part of why people who move here stay. Roles listed span startups in the digital-media scene through to the established shipping, aviation and consumer-goods employers that anchor the regional economy.`,
  ],

  // Targets "english jobs munich", "english speaking jobs munich",
  // "jobs in munich without german".
  munich: (count, companies) => [
    `Munich pairs Germany's largest corporates with a dense engineering and deep-tech scene, and it pays the highest average salaries of any German city. BMW, Siemens and Allianz are all headquartered here alongside a growing cluster of startups, chip designers and mobility companies, and their international teams work in English by default. Browse ${count}+ English-speaking jobs in Munich across software, hardware, finance, consulting, data and product.`,
    `If you are searching for jobs in Munich without German, the technology and research employers are the strongest entry point — many run English-only engineering organisations even where the wider company is German-speaking. ${companies ? `Companies hiring at the moment include ${companies}. ` : ''}Munich's higher salaries are partly offset by Germany's most expensive housing market, so it is worth weighing an offer against rent when you compare English-speaking Munich jobs with roles in Berlin or Leipzig.`,
    `Munich is also the strongest German city for hardware, automotive and aerospace engineering, and for research roles attached to the two universities and the Max Planck institutes. If you are relocating from outside the EU, the large employers here process Blue Card sponsorship as a matter of course, though you should start the housing search well before your start date — it is the hardest part of moving to Munich.`,
  ],

  // Targets "dresden jobs for english speaking".
  dresden: (count, companies) => [
    `Dresden is the centre of Silicon Saxony, Europe's largest microelectronics and semiconductor cluster, which makes it a far bigger employer of international talent than its size suggests. Infineon, GlobalFoundries, Bosch and the research network around TU Dresden and the Fraunhofer institutes all recruit worldwide, and their engineering and research teams work in English. There are ${count}+ English-speaking jobs in Dresden on this page.`,
    `${companies ? `Employers currently hiring include ${companies}. ` : ''}For English speakers, Dresden offers semiconductor and hardware engineering, embedded software, research and data roles at a cost of living well below Munich or Frankfurt — the reason a smaller city keeps drawing international applicants. Every Dresden role listed here is verified not to require German.`,
    `Dresden is also a far easier city to move to than the western hubs: rents are among the lowest of any major German city, the commute times are short, and the semiconductor employers sponsor visas routinely because they recruit internationally by necessity. Roles here skew technical, so the strongest matches are engineers, researchers and data specialists.`,
  ],

  stuttgart: (count, companies) => [
    `Stuttgart is the heart of German automotive and industrial engineering — Mercedes-Benz, Porsche and Bosch all sit in or around the city — and its R&D and software organisations recruit worldwide. Browse ${count}+ English-speaking jobs in Stuttgart across engineering, manufacturing, embedded software, data and IT, all open to candidates who don't speak German.`,
    `${companies ? `Employers currently listing roles include ${companies}. ` : ''}The region's shift towards electric drivetrains and vehicle software has pulled in international engineers faster than the local labour market can supply them, which is why so many Stuttgart teams now run in English.`,
  ],

  cologne: (count, companies) => [
    `Cologne combines Germany's media and insurance industries with a young, international population along the Rhine. Find ${count}+ English-speaking jobs in Cologne across marketing, media and production, engineering, insurance and customer success — no German required.`,
    `${companies ? `Companies hiring here include ${companies}. ` : ''}The city's broadcasters, agencies and startups work with clients across Europe, so English-language teams are common, and Cologne's rents stay well below Munich or Frankfurt for a comparable salary.`,
  ],
};

/**
 * The intro paragraphs for a city page. `topCompanies` are the employers with
 * the most open roles in the current result set, so the copy names real,
 * currently-hiring companies instead of a hard-coded list that goes stale.
 */
export function cityIntro(
  slug: string,
  label: string,
  count: number,
  topCompanies: string[],
): string[] {
  // A zero count means there are genuinely no open roles, or the API was
  // unreachable when this page was generated. Either way the bespoke copy is
  // written around a number ("With 1,200+ jobs…") and reads as broken without
  // one, so drop to a line that makes no numeric claim.
  if (count <= 0) {
    return [
      `English-speaking jobs in ${label}, Germany. Every role is checked before it is listed, so German fluency is never a hard requirement.`,
    ];
  }
  const specific = CITY_INTROS[slug];
  if (specific) return specific(count, companyList(topCompanies));
  return [
    `Find English-speaking jobs in ${label}, Germany. Browse ${count} verified ${
      count === 1 ? 'position' : 'positions'
    } that don't require German.`,
    `Every role is checked before it is listed, so you only see jobs where German fluency is not a hard requirement.`,
  ];
}
