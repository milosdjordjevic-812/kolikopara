# Koliko para

Lični app za praćenje troškova. Izvod iz Raiffeisen e-bankinga je osnova, a fiskalni računi, uplatnice i ručni unosi dodaju detalje: šta je kupljeno, šta je plaćeno gotovinom i čiji novac je samo prošao preko računa.

## Kako se pokreće prvi put

### 1. Baza (Supabase)
1. U Supabase projektu otvori **SQL Editor**, klikni **New query**, nalepi ceo fajl `supabase/schema.sql` i klikni **Run**.
2. Otvori **Authentication**, pa **Sign In / Providers**, pa **Email**, i isključi **Confirm email**. Tako se prijavljuješ odmah, bez potvrde mejlom.
3. Otvori **Project Settings**, pa **API** (ili **Data API**). Tu su dve vrednosti koje trebaju u sledećem koraku: **Project URL** i **anon public** ključ.

### 2. Objava (Vercel)
1. U Vercelu klikni **Add New**, pa **Project**, i izaberi repo `kolikopara`.
2. Pre nego što klikneš Deploy, otvori **Environment Variables** i dodaj:
   - `VITE_SUPABASE_URL` = Project URL iz Supabase-a
   - `VITE_SUPABASE_ANON_KEY` = anon public ključ iz Supabase-a
3. Klikni **Deploy**. Posle minut, dva dobijaš adresu tipa `kolikopara.vercel.app`.

### 3. Nalog i zaključavanje
1. Otvori adresu na telefonu i napravi nalog (email i lozinka).
2. Vrati se u Supabase: **Authentication**, pa **Sign In / Providers**, i isključi **Allow new users to sign up**. Posle toga niko drugi ne može da napravi nalog.
3. U Safariju klikni **Podeli**, pa **Dodaj na početni ekran**.

### 4. Podaci iz prve verzije
U appu otvori **Više**, pa **Uvezi kopiju**, i izaberi fajl `koliko-para-migracija.json`.

## Svaki mesec
- Izvezi promet tekućeg računa iz web e-bankinga (Excel ili CSV) i ubaci ga u **Više**, **Izvod**.
- Između toga skeniraj račune i uplatnice. Plaćeno karticom se samo upari sa izvodom kad ga ubaciš, plaćeno gotovinom se odbija od podignute gotovine.

## Za razvoj
```
npm install
npm run dev     # lokalno, traži .env sa VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY
npm test        # testovi čitanja računa i uplatnica
```
`api/receipt.js` je Vercel funkcija koja otvara stranu Poreske uprave za skenirani fiskalni račun i vraća artikle.
