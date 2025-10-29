#!/usr/bin/env python3
"""
Seed WhatToFlie Database
Loads fly reference data into Supabase
"""

import json
import os
from typing import Dict, List
from supabase import create_client, Client

# Load environment variables
SUPABASE_URL = ('https://wgywmkguwfojxhetfrxs.supabase.co')
SUPABASE_KEY = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndneXdta2d1d2ZvanhoZXRmcnhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTU5NjM0MiwiZXhwIjoyMDc3MTcyMzQyfQ.ZqjliBmwuSd88hTfQ-hDdikJc1RLLElvlksQmqyL1-Y')
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def load_fly_reference() -> Dict:
    """Load fly reference data from JSON file"""
    with open('fly_reference.json', 'r') as f:
        return json.load(f)

def seed_material_types():
    """Seed material types table"""
    print("Seeding material types...")
    
    material_types = [
        {'name': 'thread', 'description': 'Fly tying thread'},
        {'name': 'hook', 'description': 'Fly hooks'},
        {'name': 'bead', 'description': 'Beads and cones'},
        {'name': 'wire', 'description': 'Wire and tinsel'},
        {'name': 'dubbing', 'description': 'Dubbing materials'},
        {'name': 'feather', 'description': 'Feathers and hackle'},
        {'name': 'hair', 'description': 'Hair and fur'},
        {'name': 'synthetic', 'description': 'Synthetic materials'},
        {'name': 'flash', 'description': 'Flash and flashabou'},
        {'name': 'herl', 'description': 'Herl and peacock'},
        {'name': 'body_material', 'description': 'Body materials (chenille, etc)'},
        {'name': 'tinsel', 'description': 'Tinsel and mylar'},
        {'name': 'foam', 'description': 'Foam materials'},
        {'name': 'eyes', 'description': 'Eyes (dumbbell, bead chain, 3D)'},
        {'name': 'shank', 'description': 'Hook shanks'},
        {'name': 'finish', 'description': 'Finishing materials (epoxy, resin)'},
        {'name': 'chenille', 'description': 'Chenille'},
        {'name': 'tool', 'description': 'Tools'},
        {'name': 'fur', 'description': 'Fur strips'},
        {'name': 'body', 'description': 'Body materials'},
        {'name': 'head', 'description': 'Heads (Fish-Skull, etc)'},
    ]
    
    for mat_type in material_types:
        try:
            supabase.table('material_types').upsert(mat_type).execute()
        except Exception as e:
            print(f"Error inserting material type {mat_type['name']}: {e}")
    
    print(f"✓ Seeded {len(material_types)} material types")

def seed_fish_species():
    """Seed fish species table"""
    print("Seeding fish species...")
    
    species = [
        {'name': 'trout', 'common_names': ['rainbow', 'brown', 'brook', 'cutthroat']},
        {'name': 'bass', 'common_names': ['largemouth', 'smallmouth', 'spotted']},
        {'name': 'pike', 'common_names': ['northern pike']},
        {'name': 'muskie', 'common_names': ['muskellunge', 'musky']},
        {'name': 'panfish', 'common_names': ['bluegill', 'crappie', 'sunfish']},
        {'name': 'saltwater', 'common_names': ['general saltwater']},
        {'name': 'striped_bass', 'common_names': ['striper']},
        {'name': 'redfish', 'common_names': ['red drum']},
        {'name': 'snook', 'common_names': []},
        {'name': 'tarpon', 'common_names': ['silver king']},
        {'name': 'bonefish', 'common_names': ['bones']},
        {'name': 'permit', 'common_names': []},
        {'name': 'carp', 'common_names': ['common carp']},
        {'name': 'steelhead', 'common_names': ['sea-run rainbow']},
        {'name': 'salmon', 'common_names': ['chinook', 'coho', 'sockeye']},
        {'name': 'bluefish', 'common_names': ['blues']},
        {'name': 'GT', 'common_names': ['giant trevally']},
        {'name': 'walleye', 'common_names': ['walleyed pike']},
        {'name': 'marlin', 'common_names': []},
        {'name': 'swordfish', 'common_names': []},
        {'name': 'grayling', 'common_names': ['arctic grayling']},
    ]
    
    for sp in species:
        try:
            supabase.table('fish_species').upsert(sp).execute()
        except Exception as e:
            print(f"Error inserting species {sp['name']}: {e}")
    
    print(f"✓ Seeded {len(species)} fish species")

def seed_materials_from_flies(fly_data: Dict):
    """Extract and seed materials from fly data"""
    print("Extracting materials from flies...")
    
    # Get material type IDs
    mat_types_response = supabase.table('material_types').select('id, name').execute()
    mat_type_map = {mt['name']: mt['id'] for mt in mat_types_response.data}
    
    # Collect unique materials
    materials_dict = {}
    
    for fly in fly_data['flies']:
        for material in fly['materials']:
            mat_type = material.get('type', 'synthetic')
            mat_name = material['name']
            mat_color = material.get('color')
            mat_key = f"{mat_name}_{mat_type}_{mat_color}"
            
            if mat_key not in materials_dict:
                materials_dict[mat_key] = {
                    'name': mat_name,
                    'material_type_id': mat_type_map.get(mat_type),
                    'color': mat_color,
                    'substitutable': material.get('substitutable', False),
                    'substitute_note': material.get('substitute_note'),
                }
    
    print(f"Found {len(materials_dict)} unique materials")
    
    # Insert materials in batches
    batch_size = 100
    materials_list = list(materials_dict.values())
    
    for i in range(0, len(materials_list), batch_size):
        batch = materials_list[i:i+batch_size]
        try:
            supabase.table('materials').upsert(batch).execute()
        except Exception as e:
            print(f"Error inserting materials batch {i}: {e}")
    
    print(f"✓ Seeded {len(materials_list)} materials")

def seed_flies(fly_data: Dict):
    """Seed fly patterns"""
    print("Seeding fly patterns...")
    
    # Get species IDs
    species_response = supabase.table('fish_species').select('id, name').execute()
    species_map = {sp['name']: sp['id'] for sp in species_response.data}
    
    # Get material IDs
    materials_response = supabase.table('materials').select('id, name, material_type_id, color').execute()
    # Create lookup by name_type_color
    material_map = {}
    for mat in materials_response.data:
        mat_types_response = supabase.table('material_types').select('name').eq('id', mat['material_type_id']).execute()
        if mat_types_response.data:
            mat_type = mat_types_response.data[0]['name']
            key = f"{mat['name']}_{mat_type}_{mat.get('color')}"
            material_map[key] = mat['id']
    
    flies_inserted = 0
    
    for fly_data_item in fly_data['flies']:
        try:
            # Insert fly
            fly_record = {
                'name': fly_data_item['name'],
                'category': fly_data_item['category'],
                'sizes': fly_data_item['sizes'],
                'difficulty': fly_data_item['difficulty'],
                'is_custom': False,
            }
            
            fly_response = supabase.table('flies').insert(fly_record).execute()
            fly_id = fly_response.data[0]['id']
            
            # Insert fly-species relationships
            for species_name in fly_data_item['target_species']:
                if species_name in species_map:
                    try:
                        supabase.table('fly_species').insert({
                            'fly_id': fly_id,
                            'species_id': species_map[species_name]
                        }).execute()
                    except Exception as e:
                        print(f"Error linking fly to species: {e}")
            
            # Insert fly materials
            for material in fly_data_item['materials']:
                mat_type = material.get('type', 'synthetic')
                mat_name = material['name']
                mat_color = material.get('color')
                mat_key = f"{mat_name}_{mat_type}_{mat_color}"
                
                if mat_key in material_map:
                    try:
                        supabase.table('fly_materials').insert({
                            'fly_id': fly_id,
                            'material_id': material_map[mat_key],
                            'required': material.get('required', True),
                            'substitutable': material.get('substitutable', False),
                            'substitute_note': material.get('substitute_note'),
                        }).execute()
                    except Exception as e:
                        print(f"Error linking fly material: {e}")
            
            # Insert tutorials
            for tutorial in fly_data_item.get('tutorials', []):
                try:
                    supabase.table('tutorials').insert({
                        'fly_id': fly_id,
                        'url': tutorial['url'],
                        'title': tutorial.get('title'),
                        'tutorial_type': tutorial.get('type', 'video'),
                    }).execute()
                except Exception as e:
                    print(f"Error inserting tutorial: {e}")
            
            flies_inserted += 1
            print(f"  ✓ {fly_data_item['name']}")
            
        except Exception as e:
            print(f"✗ Error inserting fly {fly_data_item['name']}: {e}")
    
    print(f"✓ Seeded {flies_inserted} fly patterns")

def seed_hook_equivalents():
    """Seed hook equivalents table"""
    print("Seeding hook equivalents...")
    
    # Get all hooks
    hooks_response = supabase.table('materials').select('id, name, brand').execute()
    hooks_map = {f"{h['name']}_{h.get('brand', '')}": h['id'] for h in hooks_response.data}
    
    # Define equivalents (you'll expand this list)
    equivalents = [
        ('Tiemco 100', 'Umpqua U200'),
        ('Tiemco 5263', 'Umpqua U506'),
        ('Tiemco 5263', 'Mustad 9672'),
        ('Tiemco 3761', 'Umpqua U203'),
        ('Tiemco 2457', 'Umpqua U202'),
        ('Gamakatsu SL11-3H', 'Mustad 34007'),
        ('Gamakatsu SL11-3H', 'Owner SSW'),
    ]
    
    inserted = 0
    for hook1_name, hook2_name in equivalents:
        # Find hooks in map (simplified - you'd need better matching)
        hook1_id = None
        hook2_id = None
        
        for key, hid in hooks_map.items():
            if hook1_name in key:
                hook1_id = hid
            if hook2_name in key:
                hook2_id = hid
        
        if hook1_id and hook2_id:
            try:
                supabase.table('hook_equivalents').insert({
                    'hook_1_id': hook1_id,
                    'hook_2_id': hook2_id,
                    'equivalence_note': 'Similar size and style',
                }).execute()
                inserted += 1
            except Exception as e:
                print(f"Error inserting hook equivalent: {e}")
    
    print(f"✓ Seeded {inserted} hook equivalents")

def main():
    """Main seeding function"""
    print("=" * 60)
    print("WhatToFlie Database Seeding")
    print("=" * 60)
    
    # Load fly reference data
    fly_data = load_fly_reference()
    print(f"Loaded {len(fly_data['flies'])} flies from reference\n")
    
    # Seed in order (respecting foreign keys)
    seed_material_types()
    seed_fish_species()
    seed_materials_from_flies(fly_data)
    seed_flies(fly_data)
    seed_hook_equivalents()
    
    print("\n" + "=" * 60)
    print("✓ Database seeding complete!")
    print("=" * 60)

if __name__ == '__main__':
    main()
