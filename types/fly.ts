export interface BaseFly {
  id?: string;
  name: string;
  category?: string;
  difficulty?: string;
  sizes?: string;            // "12;14;16"
  target_species?: string;   // "trout;steelhead"
  colorways?: string;        // "olive;black"
  image_url?: string;
  materials?: string;        // "Hook@@1;Thread@Black@1;Wire@Silver@1"
  normalized_name?: string;  // generated in DB
}

export type CsvFly = Omit<BaseFly, 'id' | 'normalized_name'>;
