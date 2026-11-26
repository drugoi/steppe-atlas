"""Source-backed economic and site layers for the atlas."""
import csv
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2] / ".cache" / "atlas"
ACTIVITIES = {
    3: ('fields', 'Agriculture', '♧', '#d5c46e'),
    5: ('mines', 'Mining', '◆', '#e2a477'),
    6: ('works', 'Manufacturing', '▣', '#d08f6d'),
    7: ('power', 'Power & heat', 'ϟ', '#e8c579'),
    8: ('water', 'Water & waste', '◒', '#84bece'),
    9: ('building', 'Construction', '▥', '#c9b78d'),
    10: ('market', 'Trade', '◇', '#e8bf77'),
    11: ('exchange', 'Transport', '↔', '#85cbd0'),
    12: ('hospitality', 'Hospitality', '◈', '#c8a2c8'),
    13: ('signal', 'Information', '⌁', '#94aecf'),
    14: ('finance', 'Finance', '₸', '#d6b56e'),
    15: ('property', 'Real estate', '▥', '#bdaaaa'),
    16: ('research', 'Professional services', '✧', '#aeb4df'),
    17: ('support', 'Business support', '▦', '#b2b5cb'),
    18: ('civic', 'Public administration', '◈', '#e4a679'),
    19: ('learning', 'Education', '✦', '#aebcdb'),
    20: ('health', 'Health', '+', '#b6c98d'),
    21: ('culture', 'Arts & recreation', '✺', '#c8a2c8'),
    22: ('service', 'Other services', '·', '#afb9a8'),
    23: ('home', 'Household activities', '⌂', '#a6b8a9'),
}
def accounts():
    regions = {}
    series = load_workbook(ROOT/'gva.xlsx',read_only=True,data_only=True)['2018-2026']
    code = None
    for row in series.values:
        if isinstance(row[0],int) and row[1] and row[2] is None:
            code = row[0]
        if str(row[1]).strip() in {'2025','2025 год'} and isinstance(row[2],(int,float)) and code is not None:
            if code in regions:
                continue
            regions[code] = dict(total=row[2],sectors={info[0]:round(row[column],1) for column,info in ACTIVITIES.items()
                                                       if isinstance(row[column],(float,int))})
    return regions

def labor(iso_order):
    def extract(name):
        w = load_workbook(ROOT/f'{name}.xlsx',read_only=True,data_only=True)
        rows = list(w.worksheets[-1].values)
        header = next(row for row in rows if row[1]==2001)
        date_columns = {n:header.index(n) for n in range(2022,2026)}
        start = next(i for i,r in enumerate(rows) if r[0]=='Republic of Kazakhstan')
        relevant = [r for r in rows[start:] if r[0] and r[0]!='South Kazakhstan'][:len(iso_order)]
        assert len(relevant)==21 and 'Shimkent' in relevant[-1][0]
        return {ident:[round(row[index]*1000) for index in date_columns.values()] for ident,row in zip(iso_order,relevant)}
    force = extract('workforce')
    employed = extract('employed')
    return {ident:dict(force=force[ident],employed=employed[ident]) for ident in iso_order}

def locations(project,region_at):
    sites = []
    def append(kind,name,lat,lon,tag,source,**fields):
        xy = project(lon,lat)
        sites.append(dict(id=len(sites)+1,kind=kind,name=name,lat=lat,lon=lon,xy=xy,
                          region=fields.pop("region",region_at(lon,lat)),tag=tag,source=source,**fields))

    for entry in csv.DictReader((ROOT/'our-airports.csv').open()):
        if entry['iso_country']=='KZ' and entry['scheduled_service']=='yes' and entry['iata_code']:
            append('airport',entry['name'],float(entry['latitude_deg']),float(entry['longitude_deg']),
                   entry['iata_code'],'https://ourairports.com/airports/'+entry['ident']+'/')
    types = {'Coal','Gas','Hydro','Solar','Wind','Oil','Biomass'}
    for entry in csv.DictReader((ROOT/'power.csv').open(encoding='utf-8-sig')):
        if entry['country']=='KAZ' and entry['primary_fuel'] in types and entry['capacity_mw']:
            name = entry['name'].strip()
            append('energy',name,float(entry['latitude']),float(entry['longitude']),entry['primary_fuel'],
                   'https://datasets.wri.org/datasets/global-power-plant-database',mw=float(entry['capacity_mw']))
    def angle(degrees, minutes=0, seconds=0):
        return degrees+minutes/60+seconds/3600
    heritage = [
        (1103,'Mausoleum of Khoja Ahmed Yasawi',(43,17,37),(68,16,28),'Architecture',2003),
        (1145,'Tanbaly Petroglyphs',(43,48,12),(75,32,6),'Rock art',2004),
        (1102,'Korgalzhyn State Nature Reserve',(50,26),(69,11,20),'Steppe & wetlands',2008),
        (1102,'Naurzum–Kargay Cluster',(51,29,10),(64,18,13),'Steppe & wetlands',2008),
        (1490,'Karatau State Nature Reserve',(43,43),(68,40,44),'Western Tien-Shan',2016),
        (1490,'Aksu–Zhabagly State Nature Reserve',(42,16,34),(70,40,27),'Western Tien-Shan',2016),
        (1490,'Sairam–Ugam National Nature Park',(41,59,49),(70,5,12),'Western Tien-Shan',2016),
        (1693,'Altyn-Emel East',(44,1,33),(79,2,3),'Cold winter desert',2023),
        (1693,'Altyn-Emel Central',(43,53,37),(78,39,21),'Cold winter desert',2023),
        (1693,'Altyn-Emel West',(43,59,7),(78,18,15),'Cold winter desert',2023),
        (1693,'Barsakelmes Island',(45,39,14),(59,56,14),'Cold winter desert',2023),
        (1693,'Kaskakulan',(45,42,57),(61,1,47),'Cold winter desert',2023),
    ]
    for code,name,lat,lon,tag,year in heritage:
        append('heritage',name,angle(*lat),angle(*lon),tag,f'https://whc.unesco.org/en/list/{code}/maps/',year=year)
    append("port","Port of Aktau",43.602,51.210,"Caspian trading port",
           "https://zan.gov.kz/api/documents/164949/rus/download/pdf",region=47)
    return sites
