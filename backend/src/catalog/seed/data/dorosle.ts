import { SeedPack } from '../types';

/**
 * Pakiet 18+: pikantny, ale dowcipny — ma rozśmieszyć znajomych przy stole,
 * nie zawstydzić kogokolwiek. Oznaczony osobno, żeby dało się go wyłączyć
 * jednym kliknięciem, gdy skład wieczoru okaże się inny niż zakładano.
 */
export const dorosle: SeedPack = {
  name: '18+',
  description: 'Dla znajomych, którzy się nie obrażą — wyłącz jednym kliknięciem',
  color: '#ec4899',
  main: [
    {
      text: 'Co para robi, gdy dzieci nocują u babci?',
      answers: [
        ['Ogląda film bez przerw', 26],
        ['Zamawia jedzenie', 22],
        ['Idzie spać wcześniej… teoretycznie', 20],
        ['Otwiera wino', 16],
        ['Sprząta w spokoju', 9],
        ['Dzwoni sprawdzić, co u dzieci', 7],
      ],
    },
    {
      text: 'Co ludzie chowają przed gośćmi w sypialni?',
      answers: [
        ['Bałagan', 28],
        ['Pranie na krześle', 23],
        ['Zabawki dla dorosłych', 19],
        ['Dokumenty i rachunki', 13],
        ['Zdjęcia z dawnych lat', 10],
        ['Zapasy słodyczy', 7],
      ],
    },
    {
      text: 'Jaka wymówka kończy wieczór w sypialni?',
      answers: [
        ['Boli mnie głowa', 31],
        ['Jestem zmęczona/zmęczony', 26],
        ['Rano wstaję', 18],
        ['Zaraz zacznie się serial', 11],
        ['Dzieci jeszcze nie śpią', 9],
        ['Właśnie zjadłem/zjadłam za dużo', 5],
      ],
    },
    {
      text: 'Co psuje romantyczny nastrój najszybciej?',
      answers: [
        ['Telefon', 29],
        ['Dziecko w drzwiach', 22],
        ['Powiadomienie z pracy', 17],
        ['Pies wskakujący na łóżko', 15],
        ['Dzwoniący domofon', 10],
        ['Nieudany komplement', 7],
      ],
    },
    {
      text: 'Czego pary nie mówią sobie na pierwszej randce?',
      answers: [
        ['Ile naprawdę zarabiam', 27],
        ['Ile miałem/miałam związków', 24],
        ['Że mieszkam z rodzicami', 18],
        ['Że mam dzieci', 14],
        ['Że sprawdziłem/sprawdziłam cię w internecie', 11],
        ['Ile ważę', 6],
      ],
    },
    {
      text: 'Co znajdziesz w szufladzie nocnej szafki?',
      answers: [
        ['Ładowarka', 24],
        ['Leki', 21],
        ['Chusteczki', 18],
        ['Coś, o czym nie mówimy teściowej', 17],
        ['Książka', 12],
        ['Stare paragony', 8],
      ],
    },
    {
      text: 'Dlaczego ktoś nagle idzie pod prysznic w środku dnia?',
      answers: [
        ['Bo było gorąco', 27],
        ['Po treningu', 23],
        ['Żeby się obudzić', 18],
        ['Bo ktoś przyjeżdża', 15],
        ['Żeby mieć chwilę spokoju', 11],
        ['Bez komentarza', 6],
      ],
    },
    {
      text: 'Co ludzie kupują i nie chcą, żeby kurier podawał to głośno przy sąsiadach?',
      answers: [
        ['Bieliznę', 28],
        ['Zabawki dla dorosłych', 24],
        ['Leki', 18],
        ['Suplementy na odchudzanie', 14],
        ['Perukę lub przedłużane włosy', 9],
        ['Ogromną paczkę słodyczy', 7],
      ],
    },
    {
      text: 'Co jest najgorszym momentem na SMS-a od teściowej?',
      answers: [
        ['W sypialni', 32],
        ['Na randce', 23],
        ['W trakcie kłótni', 17],
        ['Na urlopie', 13],
        ['W pracy na zebraniu', 9],
        ['Przy kolacji z przyjaciółmi', 6],
      ],
    },
    {
      text: 'Co ludzie kłamią, gdy pytasz o poprzedni związek?',
      answers: [
        ['Że to już nie boli', 29],
        ['Że rozstali się w zgodzie', 24],
        ['Ile to trwało', 16],
        ['Kto kogo zostawił', 15],
        ['Że nie zaglądają na jego/jej profil', 10],
        ['Że nie mają kontaktu', 6],
      ],
    },
    {
      text: 'Po czym poznasz, że para jest razem od wielu lat?',
      answers: [
        ['Kończą swoje zdania', 26],
        ['Kłócą się o pilota', 21],
        ['Jedzą z jednego talerza', 17],
        ['Milczą i jest im dobrze', 16],
        ['Mają wspólne żarty', 12],
        ['Zasypiają na kanapie o 21', 8],
      ],
    },
    {
      text: 'Co ludzie robią, żeby zrobić wrażenie na randce?',
      answers: [
        ['Ubierają się lepiej niż zwykle', 27],
        ['Płacą za wszystko', 21],
        ['Opowiadają o pracy', 17],
        ['Zabierają do drogiej restauracji', 15],
        ['Sprzątają mieszkanie na wszelki wypadek', 13],
        ['Chowają zdjęcia byłych', 7],
      ],
    },
  ],
  final: [
    {
      text: 'Co psuje randkę już na starcie?',
      answers: [
        ['Spóźnienie', 19],
        ['Telefon na stole', 17],
        ['Rozmowa o byłych', 15],
        ['Brak pieniędzy przy rachunku', 12],
        ['Zły zapach', 11],
        ['Przechwalanie się', 9],
        ['Milczenie', 7],
        ['Zaproszenie kolegi', 5],
        ['Wybór dziwnego miejsca', 3],
        ['Rozmowa o mamie', 2],
      ],
    },
    {
      text: 'Czego ludzie nie przyznają się znajomym?',
      answers: [
        ['Ile wydali', 20],
        ['Ile ważą', 16],
        ['Ile zarabiają', 15],
        ['Że sprawdzają cudze profile', 12],
        ['Że płakali na filmie', 11],
        ['Że kłócili się z partnerem', 9],
        ['Ile czasu spędzają w telefonie', 8],
        ['Że nie czytali tej książki', 5],
        ['Że im się ktoś podoba', 3],
        ['Że nie lubią czyjegoś dziecka', 1],
      ],
    },
    {
      text: 'Co pary robią, gdy zostają same w domu?',
      answers: [
        ['Oglądają serial', 18],
        ['Zamawiają jedzenie', 16],
        ['Śpią', 14],
        ['Piją wino', 13],
        ['Chodzą w piżamie cały dzień', 11],
        ['Sprzątają', 9],
        ['Rozmawiają', 8],
        ['Nadrabiają zaległości', 6],
        ['Grają', 3],
        ['Dzwonią do rodziny', 2],
      ],
    },
    {
      text: 'Gdzie ludzie robią rzeczy, o których potem nie opowiadają?',
      answers: [
        ['W samochodzie', 20],
        ['Na wakacjach', 17],
        ['W hotelu', 15],
        ['W kuchni', 12],
        ['Pod prysznicem', 11],
        ['Na kanapie', 9],
        ['W pracy', 7],
        ['W windzie', 5],
        ['W lesie', 3],
        ['U teściowej', 1],
      ],
    },
  ],
};
