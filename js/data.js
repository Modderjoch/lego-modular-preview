/**
 * data.js — LEGO Modular Building definitions
 *
 * Each entry describes one modular. The `id` must match the folder name
 * under /models/ (e.g. "cafe-corner" → /models/cafe-corner/cafe-corner.gltf).
 *
 * Fields
 * ──────
 * id         string   Slug — must match the model folder and file name
 * name       string   Display name
 * year       number   Release year
 * set        string   LEGO set number
 * floors     number   Number of floors (drives scale + floor-clip control)
 * widthU     number   Width in 32-stud modules (1 for most, 2 for wide sets)
 * color      string   Fallback hex colour shown before thumbnail loads
 * accent     string   Accent / trim hex (placeholder geometry only)
 * roofColor  string   Roof / parapet hex (placeholder geometry only)
 */
const MODULARS = [
  {
    id: 'cafe-corner',
    name: 'Café Corner',
    year: 2007,
    set: '10182',
    floors: 3,
    widthU: 1,
    color: '#c8934a', accent: '#e8b86d', roofColor: '#8b6635',
  },
  {
    id: 'market-street',
    name: 'Market Street',
    year: 2007,
    set: '10190',
    floors: 3,
    widthU: 1,
    color: '#c8a87a', accent: '#e0c090', roofColor: '#806040',
  },
  {
    id: 'green-grocer',
    name: 'Green Grocer',
    year: 2008,
    set: '10185',
    floors: 3,
    widthU: 1,
    color: '#5a8c4a', accent: '#7db860', roofColor: '#3d6030',
  },
  {
    id: 'fire-brigade',
    name: 'Fire Brigade',
    year: 2011,
    set: '10197',
    floors: 3,
    widthU: 1,
    scaleOverride: 0.01724,
    color: '#c43030', accent: '#e05040', roofColor: '#8c2020',
  },
  {
    id: 'grand-emporium',
    name: 'Grand Emporium',
    year: 2010,
    set: '10211',
    floors: 3,
    widthU: 1,
    scaleOverride: 0.01724,
    color: '#e8e0d0', accent: '#d4c8a8', roofColor: '#a89870',
  },
  {
    id: 'pet-shop',
    name: 'Pet Shop',
    year: 2011,
    set: '10218',
    floors: 3,
    widthU: 1,
    color: '#c09060', accent: '#d4aa78', roofColor: '#806040',
  },
  {
    id: 'town-hall',
    name: 'Town Hall',
    year: 2012,
    set: '10224',
    floors: 4,
    widthU: 1,
    color: '#e8e0c8', accent: '#d4c8a0', roofColor: '#707060',
  },
  {
    id: 'palace-cinema',
    name: 'Palace Cinema',
    year: 2013,
    set: '10232',
    floors: 3,
    widthU: 1,
    color: '#f5e8c8', accent: '#e8d4a0', roofColor: '#c8b880',
  },
  {
    id: 'parisian-restaurant',
    name: 'Parisian Restaurant',
    year: 2014,
    set: '10243',
    floors: 3,
    widthU: 1,
    color: '#f0ead8', accent: '#d8cca8', roofColor: '#888070',
  },
  {
    id: 'detective-office',
    name: "Detective's Office",
    year: 2015,
    set: '10246',
    floors: 3,
    widthU: 1,
    color: '#6880a0', accent: '#8898b8', roofColor: '#404e60',
  },
  {
    id: 'brick-bank',
    name: 'Brick Bank',
    year: 2016,
    set: '10251',
    floors: 3,
    widthU: 1,
    color: '#e8dcc0', accent: '#d4c898', roofColor: '#908060',
  },
  {
    id: 'assembly-square',
    name: 'Assembly Square',
    year: 2017,
    set: '10255',
    floors: 3,
    widthU: 2, // spans two baseplates
    color: '#e8c878', accent: '#d4a840', roofColor: '#806020',
  },
  {
    id: 'downtown-diner',
    name: 'Downtown Diner',
    year: 2018,
    set: '10260',
    floors: 3,
    widthU: 1,
    color: '#e8c840', accent: '#f0d860', roofColor: '#a08820',
  },
  {
    id: 'corner-garage',
    name: 'Corner Garage',
    year: 2019,
    set: '10264',
    floors: 3,
    widthU: 1,
    color: '#c8c0a8', accent: '#b0a888', roofColor: '#686050',
  },
  {
    id: 'bookshop',
    name: 'Bookshop',
    year: 2020,
    set: '10270',
    floors: 4,
    widthU: 1,
    color: '#a06840', accent: '#c08858', roofColor: '#704828',
  },
  {
    id: 'police-station',
    name: 'Police Station',
    year: 2021,
    set: '10278',
    floors: 3,
    widthU: 1,
    color: '#d8d0c0', accent: '#c0b8a0', roofColor: '#606858',
  },
  {
    id: 'boutique-hotel',
    name: 'Boutique Hotel',
    year: 2022,
    set: '10297',
    floors: 4,
    widthU: 1,
    color: '#b8a0c8', accent: '#d0b8e0', roofColor: '#785888',
  },
  {
    id: 'jazz-club',
    name: 'Jazz Club',
    year: 2023,
    set: '10312',
    floors: 3,
    widthU: 1,
    color: '#384858', accent: '#506070', roofColor: '#202830',
  },
  {
    id: 'natural-history-museum',
    name: 'Natural History Museum',
    year: 2024,
    set: '10326',
    floors: 3,
    widthU: 2, // spans one and a half baseplates, treated as 2
    color: '#e8e0d0', accent: '#d0c8b0', roofColor: '#a09080',
  },
  {
    id: 'tudor-corner',
    name: 'Tudor Corner',
    year: 2025,
    set: '10350',
    floors: 3,
    widthU: 1,
    scaleOverride: 0.01724,
    color: '#c8b090', accent: '#d4c0a0', roofColor: '#503820',
  }
];