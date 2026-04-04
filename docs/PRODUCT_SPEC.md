# Finni — tuotekuvaus

## Mitä rakennetaan

**Finni** on suomalaisiin rakennushankkeisiin tarkoitettu **multi-tenant SaaS**: käyttäjä kokoaa rakennuksen ja tuotteet, liittää päästökertoimet (geneerinen katalogi tai tuotekohtainen EPD-tyyppi), laskee elinkaaren CO₂e-moduuleittain (A1–A3, A4, A5, B, C) ja tuottaa **versioidun** ilmastoselvityksen sekä tuoteluettelon vientinä (PDF, XLSX).

Tavoitteena on **deterministinen ja auditoitava** laskenta: sama syöte tuottaa saman tuloksen, muutokset jäljittävät version ja lukituksen kautta.

## Käyttäjätarpeet

| Rooli | Mitä halutaan tehdä |
|--------|----------------------|
| Pääsuunnittelija / arkkitehti | Syöttää hankkeen ja rakennuksen perustiedot, hallita versioita |
| LVI / rakenne / sähkö | Lisätä ja täyttää tuoterivit, jakaa moduuliosuuksia |
| Rakennuttaja / kehittäjä | Tarkastella kokonaisuutta, viedä raportteja |
| Viranomainen | Lukea ja tarkastaa lukittu raportti (read-only) |
| Tenant-admin | Hallita käyttäjiä omassa organisaatiossa |

Käyttäjät tekevät työnsä **projektin** ja **version** sisällä; laskenta ja hyväksyntä koskevat aina yhtä versiota kerrallaan.

## Tenant- ja datamalli (käsitteet)

- **Tenant** = organisaatio (yritys). Data ei ylitä tenant-rajaa.
- **Project** = rakennushanke (työtila).
- **Version** = laskenta- ja raportointitila (`draft` → `locked`). Lukittu versio on muokkauskielto tuotteissa ja rakennustiedoissa version kontekstissa.
- **Building** ja **tuotteet** liittyvät projektiin / versioon kuten toteutuksessa määritelty.

## MVP-scope

### Mukana (MVP)

- Multi-tenant + käyttäjät rooleilla
- Projektit, rakennus (pinta-ala, tilat), versiot ja kloonaus
- Manuaalinen tuotetieto, moduuliosuudet, päästökertoimen valinta
- Geneerinen päästökirjasto (seed/MVP-taso) ja snapshot-kentät tuotteella
- Deterministinen moduulikohtainen laskenta palvelimella
- Validointinäkymä (säännöt täyttyvätkö)
- Version lukitus (admin / reviewer)
- PDF- ja XLSX-vienti
- Audit-logi (tallennusrakenne skeeman mukaan)

### Ulkona (ei MVP)

- IFC/BIM-tuonti
- Automaattinen ulkoinen CO₂-data-mappaus ja API-integraatiot
- Monen maan sääntölogiikka
- Laajennetut elinkaarioskenaariot yli nykyisen moduelijaon
- Tenant-kohtainen EPD-tiedostojen upload -käyttöliittymä (skeema voi silti tukea tulevaa `tenant_id`-kenttää katalogissa)

## Liiketoiminnalliset peruslupaukset

1. Tulokset ovat **jäljitettäviä** (versio, lukitus, audit).
2. Laskenta on **läpinäkyvä** (määrä × kerroin × moduuliosuus, näytettävissä UI:ssa).
3. **Tenant-eristys** on pakollinen: asiakas näkee vain oman organisaationsa datan.

Tarkempi tekninen järjestely: [SYSTEM_SPEC.md](./SYSTEM_SPEC.md). Nykytila: [PROJECT_STATUS.md](./PROJECT_STATUS.md).
