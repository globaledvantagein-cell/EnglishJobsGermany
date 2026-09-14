/**
 * German city/state names used for location matching in utils/job.ts.
 * Kept lowercase. Extracted from job.ts so the hot module stays small.
 */
export const GERMAN_CITY_NAMES: readonly string[] = [
    // Major cities (top 80 by population)
    'berlin', 'hamburg', 'munich', 'münchen', 'cologne', 'köln',
    'frankfurt', 'stuttgart', 'düsseldorf', 'dusseldorf', 'leipzig',
    'dortmund', 'essen', 'bremen', 'dresden', 'hannover', 'hanover',
    'nuremberg', 'nürnberg', 'duisburg', 'bochum', 'wuppertal',
    'bielefeld', 'bonn', 'münster', 'munster', 'karlsruhe', 'mannheim',
    'augsburg', 'wiesbaden', 'mönchengladbach', 'gelsenkirchen',
    'braunschweig', 'aachen', 'kiel', 'chemnitz', 'halle',
    'magdeburg', 'freiburg', 'krefeld', 'lübeck', 'lubeck',
    'oberhausen', 'erfurt', 'mainz', 'rostock', 'kassel', 'hagen',
    'potsdam', 'saarbrücken', 'saarbrucken', 'hamm', 'ludwigshafen',
    'leverkusen', 'oldenburg', 'osnabrück', 'osnabruck', 'solingen',
    'heidelberg', 'darmstadt', 'regensburg', 'ingolstadt', 'würzburg',
    'wurzburg', 'wolfsburg', 'göttingen', 'gottingen', 'recklinghausen',
    'heilbronn', 'ulm', 'pforzheim', 'offenbach', 'bottrop', 'trier',
    'jena', 'cottbus', 'siegen', 'hildesheim', 'salzgitter',

    // Mid-size cities (population 30k–100k)
    'gütersloh', 'gutersloh', 'iserlohn', 'schwerin', 'koblenz',
    'zwickau', 'witten', 'gera', 'hanau', 'esslingen', 'ludwigsburg',
    'tübingen', 'tubingen', 'flensburg', 'konstanz', 'worms',
    'marburg', 'lüneburg', 'luneburg', 'bayreuth', 'bamberg',
    'plauen', 'neubrandenburg', 'wilhelmshaven', 'paderborn',
    'reutlingen', 'neuss', 'passau', 'landshut', 'rosenheim',
    'kaiserslautern', 'giessen', 'gießen', 'fulda', 'weimar',
    'dessau', 'celle', 'detmold', 'schwäbisch gmünd', 'ravensburg',
    'friedrichshafen', 'villingen-schwenningen', 'sindelfingen',
    'böblingen', 'leonberg', 'norderstedt', 'delmenhorst',
    'neumünster', 'neustadt', 'herford', 'minden', 'arnsberg',
    'lüdenscheid', 'unna', 'bergisch gladbach', 'troisdorf',
    'euskirchen', 'dormagen', 'grevenbroich', 'meerbusch',
    'ratingen', 'velbert', 'mettmann', 'langenfeld', 'monheim',
    'hürth', 'kerpen', 'brühl', 'erftstadt', 'frechen',
    'pulheim', 'bergheim', 'hennef', 'sankt augustin', 'bad honnef',
    'königswinter', 'bornheim', 'meckenheim', 'rheinbach',

    // Tech/industry hub towns
    'ottobrunn', 'garching', 'walldorf', 'feldkirchen', 'unterschleissheim',
    'unterhaching', 'ismaning', 'pullach', 'grünwald', 'grasbrunn',
    'haar', 'kirchheim', 'penzberg', 'holzkirchen', 'starnberg',
    'germering', 'gilching', 'planegg', 'martinsried', 'neubiberg',
    'oberhaching', 'taufkirchen', 'brunnthal', 'aschheim', 'heimstetten',
    'maisach', 'olching', 'dachau', 'freising', 'erding',
    'weinheim', 'grenzach', 'wyhlen', 'grenzach-wyhlen',
    'biberach', 'wedel', 'isenburg', 'neu-isenburg', 'neu isenburg',
    'eschborn', 'kronberg', 'bad homburg', 'oberursel', 'friedberg',
    'dreieich', 'langen', 'dietzenbach', 'rodgau', 'seligenstadt',
    'bad vilbel', 'karben', 'nidderau',

    // Industrial/pharma/chemical towns
    'leuna', 'bitterfeld', 'schkopau', 'frankenthal', 'speyer',
    'neustadt an der weinstraße',
    'brunsbüttel', 'brunsbuttel', 'meppen', 'emden',
    'cuxhaven', 'stade', 'buxtehude', 'leer', 'aurich',
    'papenburg', 'nordhorn', 'lingen', 'rheine', 'ibbenbüren',
    'bocholt', 'borken', 'coesfeld', 'ahlen', 'beckum',
    'warendorf', 'hameln', 'holzminden', 'alfeld', 'goslar',
    'clausthal', 'wolfenbüttel', 'peine', 'gifhorn',
    'helmstedt', 'schöningen', 'königslutter',
    'bad harzburg', 'seesen', 'osterode', 'northeim',
    'einbeck', 'uslar', 'duderstadt',

    // Eastern Germany
    'oranienburg', 'falkensee', 'bernau', 'eberswalde',
    'schwedt', 'fürstenwalde', 'eisenhüttenstadt', 'senftenberg',
    'spremberg', 'forst', 'guben', 'luckenwalde', 'königs wusterhausen',
    'ludwigsfelde', 'teltow', 'stahnsdorf', 'kleinmachnow',
    'wildau', 'schönefeld', 'blankenfelde', 'rangsdorf',
    'stralsund', 'greifswald', 'wismar', 'güstrow', 'waren',
    'neustrelitz', 'parchim', 'ludwigslust', 'hagenow',
    'wittenberg', 'köthen', 'bernburg',
    'aschersleben', 'quedlinburg', 'halberstadt', 'wernigerode',
    'stendal', 'salzwedel', 'gardelegen',
    'nordhausen', 'mühlhausen', 'eisenach', 'gotha', 'arnstadt',
    'ilmenau', 'suhl', 'meiningen', 'sonneberg', 'saalfeld',
    'rudolstadt', 'altenburg', 'schmölln',
    'bautzen', 'görlitz', 'zittau', 'löbau', 'kamenz',
    'hoyerswerda', 'riesa', 'meissen', 'pirna', 'freital',
    'radebeul', 'coswig', 'döbeln', 'mittweida', 'freiberg',
    'annaberg', 'aue', 'schwarzenberg', 'marienberg',
    'limbach-oberfrohna', 'crimmitschau', 'werdau', 'reichenbach',

    // Bavaria (beyond Munich)
    'erlangen', 'fürth', 'schwabach', 'ansbach', 'neumarkt',
    'amberg', 'weiden', 'tirschenreuth', 'hof', 'selb',
    'kulmbach', 'lichtenfels', 'coburg', 'kronach',
    'schweinfurt', 'bad kissingen', 'aschaffenburg', 'miltenberg',
    'kitzingen', 'ochsenfurt', 'bad neustadt',
    'deggendorf', 'straubing', 'cham', 'regen', 'freyung',
    'altötting', 'mühldorf', 'traunstein', 'berchtesgaden',
    'bad reichenhall', 'miesbach', 'garmisch-partenkirchen',
    'weilheim', 'schongau', 'landsberg', 'fürstenfeldbruck',
    'kaufbeuren', 'kempten', 'memmingen', 'lindau',
    'neu-ulm', 'günzburg', 'dillingen', 'donauwörth', 'nördlingen',

    // Baden-Württemberg (beyond Stuttgart)
    'waiblingen', 'fellbach', 'backnang', 'schorndorf',
    'göppingen', 'geislingen', 'nürtingen',
    'kirchheim unter teck', 'filderstadt', 'leinfelden-echterdingen',
    'herrenberg', 'rottenburg', 'hechingen', 'balingen',
    'albstadt', 'tuttlingen', 'rottweil', 'oberndorf',
    'offenburg', 'lahr', 'kehl', 'achern', 'bühl',
    'baden-baden', 'rastatt', 'gaggenau', 'ettlingen',
    'bruchsal', 'sinsheim', 'mosbach', 'buchen',
    'schwetzingen', 'hockenheim', 'wiesloch',
    'lörrach', 'weil am rhein', 'rheinfelden', 'schopfheim',
    'waldshut-tiengen', 'bad säckingen', 'stockach',
    'überlingen', 'salem', 'markdorf', 'tettnang',

    // Schleswig-Holstein
    'elmshorn', 'pinneberg', 'itzehoe', 'heide', 'husum',
    'schleswig', 'rendsburg', 'eckernförde', 'eutin',
    'bad segeberg', 'bad oldesloe', 'ahrensburg', 'reinbek',
    'geesthacht', 'lauenburg', 'mölln', 'ratzeburg',

    // Hessen (beyond Frankfurt)
    'rüsselsheim', 'raunheim', 'kelsterbach', 'mörfelden-walldorf',
    'wetzlar', 'limburg',
    'bad nauheim', 'butzbach',
    'bad hersfeld', 'alsfeld', 'lauterbach',

    // Niedersachsen (beyond Hannover)
    'cloppenburg', 'vechta',

    // NRW (beyond Düsseldorf/Cologne)
    'herne', 'mülheim', 'remscheid',
    'siegburg', 'lohmar', 'much', 'bad godesberg',
    'düren', 'jülich', 'heinsberg', 'erkelenz', 'wegberg',
    'viersen', 'kempen', 'willich', 'tönisvorst', 'kaarst',
    'korschenbroich', 'jüchen',
    'wülfrath', 'haan', 'hilden', 'erkrath', 'hattingen',
    'sprockhövel', 'schwelm', 'ennepetal', 'gevelsberg',
    'herdecke', 'wetter', 'castrop-rauxel', 'lünen', 'selm',
    'werne', 'bergkamen', 'kamen', 'holzwickede', 'schwerte',
    'hemer', 'menden', 'meschede',
    'brilon', 'winterberg', 'olsberg', 'lippstadt', 'soest',
    'warstein', 'werl', 'oelde', 'rheda-wiedenbrück',
    'bad oeynhausen', 'löhne', 'bünde', 'vlotho', 'porta westfalica',
    'delbrück', 'bad lippspringe', 'altenbeken',
    'höxter', 'lemgo', 'bad salzuflen', 'lage',

    // Rheinland-Pfalz
    'landau', 'pirmasens', 'zweibrücken', 'bad kreuznach',
    'idar-oberstein', 'bingen', 'ingelheim', 'andernach',
    'neuwied', 'bendorf', 'montabaur',

    // Saarland
    'saarlouis', 'neunkirchen', 'homburg',
    'merzig', 'völklingen', 'st. ingbert',

    // German state names (for "Neu Isenburg, Hessen" style locations)
    'germany', 'deutschland',
    'hessen', 'bayern', 'bavaria', 'sachsen', 'saxony',
    'niedersachsen', 'nordrhein-westfalen', 'nrw',
    'baden-württemberg', 'baden württemberg', 'rheinland-pfalz',
    'schleswig-holstein', 'mecklenburg-vorpommern',
    'thüringen', 'thuringia', 'brandenburg', 'saarland',
    'sachsen-anhalt', 'saxony-anhalt',
];
