import tkinter as tk
from tkinter import ttk, messagebox
import random as rand
from threading import Timer
import math
from item_data import ITEM_IMAGES, ITEM_DETAILS
from image_manager import ImageManager
from rarity_data import RARITY_COLORS, RARITY_MULTIPLIERS


class Character:
    def __init__(self):
        self.level = 1
        self.exp = 0
        self.exp_needed = 100
        self.base_stats = {
            "attack": 10,
            "defense": 10,
            "health": 100,
            "max_health": 100
        }
        self.equipped = {
            "armor": None,
            "weapon": None,  # This slot will be shared between weapons and staffs
            "shield": None,
            "ring": None,
            "gloves": None,
            "necklace": None
        }

        self.computed_stats = self.base_stats.copy()

    def equip_item(self, item):
        # Map item types to slots
        type_to_slot = {
            "armor": "armor",
            "weapon": "weapon",
            "staff": "weapon",  # Staff uses weapon slot
            "shield": "shield",
            "ring": "ring",
            "gloves": "gloves",
            "necklace": "necklace"
        }
        
        slot = type_to_slot.get(item.item_type)
        if slot:
            self.equipped[slot] = item
            self.compute_stats()

    def compute_stats(self):
        self.computed_stats = self.base_stats.copy()
        for item in self.equipped.values():
            if item:
                for stat, value in item.stats.items():
                    self.computed_stats[stat] += value

    def gain_exp(self, amount):
        self.exp += amount
        while self.exp >= self.exp_needed:
            self.level_up()

    def level_up(self):
        self.exp -= self.exp_needed
        self.level += 1
        self.exp_needed = math.floor(self.exp_needed * 1.5)
        for stat in self.base_stats:
            self.base_stats[stat] = math.floor(self.base_stats[stat] * 1.1)
        self.compute_stats()
        self.base_stats["health"] = self.base_stats["max_health"]

class Item:
    def __init__(self, name, rarity, item_type):
        self.name = name
        self.rarity = rarity
        self.item_type = item_type
        self.level = 1
        
        multiplier = RARITY_MULTIPLIERS[rarity]
        
        # Get item details if available
        self.details = ITEM_DETAILS.get(name, {})

        
        # Base stats for each item type
        if item_type == "armor":
            self.stats = {
                "max_health": 10 * multiplier,
                "health": 10 * multiplier,
                "defense": 2 * multiplier
            }
        elif item_type in ["weapon", "staff"]:  # Combined weapon/staff slot
            self.stats = {
                "attack": 8 * multiplier
            }
        elif item_type == "shield":
            self.stats = {
                "defense": 10 * multiplier,
            }
        elif item_type == "ring":
            self.stats = {
                "attack": 2 * multiplier,
                "defense": 4 * multiplier
            }
        elif item_type == "gloves":
            self.stats = {
                "attack": 4 * multiplier,
                "defense": 2 * multiplier
            }
        elif item_type == "necklace":
            self.stats = {
                "max_health": 15 * multiplier,
                "health": 15 * multiplier
            }


class Enemy:
    def __init__(self, name, level):
        self.name = name
        self.level = level
        self.health = 75 * level
        self.max_health = 75 * level
        self.attack = 9 * level
        self.defense = 5 * level

    def is_alive(self):
        return self.health > 0


class Adventure:
    def __init__(self):
        self.zones = {
            "Training Grounds": {
                "level": 1,
                "enemies": ["Training Dummy", "Novice Warrior"],
                "coin_reward": (10, 20),
                "exp_reward": (20, 40),
                "time": 15  # seconds
            },
            "Forest": {
                "level": 5,
                "enemies": ["Wolf", "Bandit", "Dark Elf"],
                "coin_reward": (40, 80),
                "exp_reward": (60, 100),
                "time": 15
            },
            "Dark Cave": {
                "level": 10,
                "enemies": ["Troll", "Dark Beast", "Shadow Knight"],
                "coin_reward": (100, 200),
                "exp_reward": (150, 250),
                "time": 15
            },
            "Dragon's Lair": {
                "level": 20,
                "enemies": ["Dragon Cultist", "Dragon Spawn", "Ancient Dragon"],
                "coin_reward": (300, 600),
                "exp_reward": (400, 800),
                "time": 15
            }
        }
        self.current_adventure = None
        self.timer = None


class CombatManager:
    def __init__(self, zone_name, zone_info, character):
        self.zone_name = zone_name
        self.zone_info = zone_info
        self.character = character
        self.enemies_defeated = 0
        self.current_enemy = None
        self.combat_active = False
        
    def spawn_enemy(self):
        enemy_name = rand.choice(self.zone_info["enemies"])
        return Enemy(enemy_name, self.zone_info["level"])
    
    def is_combat_finished(self):
        return (not self.current_enemy.is_alive() or 
                self.character.computed_stats["health"] <= 0)


class LootSystemGUI(tk.Frame):
    def __init__(self, root):
        super().__init__(root)
        self.root = root
        self.root.title("Advanced Loot System")
        self.root.geometry("1200x800")
        self.character = Character()
        self.adventure = Adventure()

        self.chest_tiers = {
            "Basic": {
                "price": 100,
                "rarity_multipliers": {
                    "common": 1.0,      # Base chances
                    "uncommon": 1.0,
                    "rare": 1.0,
                    "epic": 1.0,
                    "legendary": 1.0,
                    "mythic": 1.0,
                    "divine": 1.0,
                    "unspoken": 1.0
                }
            },
            "Advanced": {
                "price": 500,
                "rarity_multipliers": {
                    "common": 0.0,      # No common
                    "uncommon": 1.8,
                    "rare": 1.7,
                    "epic": 1.5,
                    "legendary": 1.3,
                    "mythic": 1.2,
                    "divine": 1.1,
                    "unspoken": 1.0
                }
            },
            "Elite": {
                "price": 2500,
                "rarity_multipliers": {
                    "common": 0.0,      # No common or uncommon
                    "uncommon": 0.0,
                    "rare": 2.4,
                    "epic": 2.2,
                    "legendary": 1.5,
                    "mythic": 1.5,
                    "divine": 1.3,
                    "unspoken": 1.1
                }
            },
            "Legendary": {
                "price": 10000,
                "rarity_multipliers": {
                    "common": 0.0,      # No common, uncommon, or rare 
                    "uncommon": 0.0,
                    "rare": 0.0,
                    "epic": 2.6,
                    "legendary": 2.5,
                    "mythic": 1.8,
                    "divine": 1.7,
                    "unspoken": 1.2
                }
            }
        }


        self.keys = {tier: 0 for tier in self.chest_tiers}  # Starting keys for each tier
        

        # Price multipliers for each rarity
        self.price_multipliers = {
            "common": 10,
            "uncommon": 25,
            "rare": 75,
            "epic": 200,
            "legendary": 500,
            "mythic": 1500,
            "divine": 5000,
            "unspoken": 15000
        }
        
        # Rarity colors
        self.rarity_colors = {
            "common": "#808080",      # Gray
            "uncommon": "#00FF00",    # Green
            "rare": "#0000FF",        # Blue
            "epic": "#800080",        # Purple
            "legendary": "#FFA500",   # Orange
            "mythic": "#FF0000",      # Red
            "divine": "#FFB6C1",      # Light Pink
            "unspoken": "#FF1493"     # Deep Pink
        }
        
        self.items = {
            "common": {
                "weapon": ["Wooden Sword", "Wooden Axe", "Wooden Mace"],
                "armor": ["Wooden Armor", "Leather Armor", "Cotton Robes"],
                "shield": ["Wooden Shield", "Leather Shield"],
                "staff": ["Apprentice Staff", "Wooden Wand"],
                "ring": ["Copper Ring", "Wooden Ring"],
                "gloves": ["Leather Gloves", "Cotton Gloves"],
                "necklace": ["Hemp Necklace", "Wooden Pendant"]
            },
            "uncommon": {
                "weapon": ["Iron Sword", "Bronze Axe", "Steel Mace"],
                "armor": ["Iron Chestplate", "Padded Leather Armor", "Hardened Robes"],
                "shield": ["Iron Shield", "Reinforced Leather Shield"],
                "staff": ["Initiate Staff", "Oak Wand"],
                "ring": ["Bronze Ring", "Iron Band"],
                "gloves": ["Iron Gauntlets", "Stitched Leather Gloves"],
                "necklace": ["Copper Chain", "Iron Pendant"]
            },
            "rare": {
                "weapon": ["Steel Longsword", "Runed Battleaxe", "Spiked Morningstar"],
                "armor": ["Steel Armor", "Enchanted Leather Vest", "Silken Robes"],
                "shield": ["Steel Shield", "Runed Buckler"],
                "staff": ["Mage’s Staff", "Crystal Wand"],
                "ring": ["Silver Ring", "Runed Band"],
                "gloves": ["Steel Gauntlets", "Silken Gloves"],
                "necklace": ["Silver Amulet", "Crystal Pendant"]
            },
            "epic": {
                "weapon": ["Fiery Blade", "Shadow Cleaver", "Thunder Hammer"],
                "armor": ["Dragonhide Vest", "Shadowforged Plate", "Mystic Robes"],
                "shield": ["Dragon Scale Shield", "Aegis of Shadows"],
                "staff": ["Arcane Staff", "Eldritch Wand"],
                "ring": ["Ring of Flames", "Moonstone Band"],
                "gloves": ["Gauntlets of Power", "Spellwoven Gloves"],
                "necklace": ["Amulet of the Phoenix", "Runed Locket"]
            },
            "legendary": {
                "weapon": ["Sword of Heroes", "Axe of the Forgotten King", "Hammer of the Titans"],
                "armor": ["Celestial Plate", "Eternal Vestments", "Dragonweave Robes"],
                "shield": ["Aegis of Eternity", "Shield of the Colossus"],
                "staff": ["Staff of the Archmage", "Wand of Infinite Wisdom"],
                "ring": ["Ring of the Ancients", "Band of Eternity"],
                "gloves": ["Gloves of the Flamekeeper", "Voidforged Gauntlets"],
                "necklace": ["Necklace of Everlasting Light", "Amulet of the Eternal"]
            },
            "mythic": {
                "weapon": ["Blade of Infinite Stars", "Axe of the Cosmos", "Hammer of Eternal Fury"],
                "armor": ["Armor of the Void", "Cosmic Vestments", "Robes of the Archon"],
                "shield": ["Barrier of Infinity", "Bulwark of the Eternal"],
                "staff": ["Staff of the Voidseer", "Wand of the Cosmos"],
                "ring": ["Mythril Ring", "Band of Infinity"],
                "gloves": ["Gauntlets of the Cosmos", "Gloves of the Unseen"],
                "necklace": ["Pendant of Infinity", "Amulet of the Beyond"]
            },
            "divine": {
                "weapon": ["Heavenly Blade", "Axe of Divine Wrath", "Hammer of the Holy"],
                "armor": ["Raiment of the Heavens", "Divine Plate", "Robes of the Seraphim"],
                "shield": ["Shield of the Archangel", "Aegis of Divinity"],
                "staff": ["Staff of Celestial Power", "Wand of the Seraph"],
                "ring": ["Halo Ring", "Celestial Band"],
                "gloves": ["Gloves of Divinity", "Gauntlets of the Heavens"],
                "necklace": ["Amulet of the Angels", "Necklace of Celestial Grace"]
            },
            "unspoken": {
                "weapon": ["Nameless Blade", "Axe of the Unseen", "Hammer of Forgotten Oaths"],
                "armor": ["Shroud of the Unspoken", "Armor of the Veil", "Ethereal Robes"],
                "shield": ["Shield of Silent Promises", "Aegis of Whispers"],
                "staff": ["Staff of the Nameless", "Wand of Eternal Mystery"],
                "ring": ["Ring of the Unknown", "Band of Silent Eternity"],
                "gloves": ["Veiled Gauntlets", "Gloves of Hidden Truths"],
                "necklace": ["Necklace of the Forgotten", "Amulet of the Unspoken"]
            }
        }
        
        # Initialize image manager
        self.image_manager = ImageManager()
        self.image_manager.load_images(ITEM_IMAGES)

        # Initialize inventory grid
        self.inventory_size = 1  # Maximum number of items
        self.items_per_row = 10  # Number of items per row
        self.inventory_buttons = []  # Store inventory button widgets

    
        

        self.max_adventures = 1
        self.current_adventures = 0
        self.upgrade_cost = 100000
        self.active_adventures = {}  # Store active adventure information
        self.combat_managers = {}    # Store combat managers for each active adventure

        # starting stats
        self.stats = {
            "coins": 2000,
            "chests_opened": {tier: 0 for tier in self.chest_tiers},  # Track per tier
            "total_chests_opened": 0,
            "coins_spent": 0,
            "items_sold": 0,
            "coins_earned": 0,
            "rarities_found": {rarity: 0 for rarity in self.items.keys()},
            "adventures_completed": 0,
            "total_enemies_defeated": 0,
            "total_exp_earned": 0,
            "active_adventures": 0,
            "max_adventures": self.max_adventures
        }
        
        self.inventory = []
        self.create_widgets()
        self.update_counters()
        self.create_context_menu()
        self.create_adventure_frame()
        self.create_character_frame()
        self.create_equipment_frame()
        self.filtered_items = []
        self.filtered_indices = []

    ### WIDGETS UI STUFF
    def create_widgets(self):
        # Configure root grid
        self.root.grid_rowconfigure(1, weight=1)
        self.root.grid_columnconfigure(0, weight=1)
        self.root.grid_columnconfigure(1, weight=1)
        
        # Create the main UI
        self.create_main_frames()
        self.create_stats_section()
        self.create_chest_controls()
        self.create_filter_section()
        self.create_action_buttons()
        self.create_inventory_section()

    def create_main_frames(self):
        # Left frame
        self.left_frame = ttk.Frame(self.root, padding="10")
        self.left_frame.grid(row=0, column=0, rowspan=2, sticky="nsew")
        self.left_frame.grid_columnconfigure(0, weight=1)
        
        # Right frame
        self.right_frame = ttk.Frame(self.root, padding="10")
        self.right_frame.grid(row=0, column=1, rowspan=2, sticky="nsew")
        self.right_frame.grid_columnconfigure(0, weight=1)

    def create_stats_section(self):
        self.stats_frame = ttk.LabelFrame(self.left_frame, text="Game Stats", padding="5")
        self.stats_frame.grid(row=0, column=0, sticky="ew", padx=5)
        self.stats_frame.grid_columnconfigure((0,1,2,3), weight=1)

        # Create four columns for stats
        left_stats = ttk.Frame(self.stats_frame)
        left_stats.grid(row=0, column=0, padx=10, sticky="nw")
        middle_stats = ttk.Frame(self.stats_frame)
        middle_stats.grid(row=0, column=1, padx=10, sticky="nw")
        right_stats = ttk.Frame(self.stats_frame)
        right_stats.grid(row=0, column=2, padx=10, sticky="nw")
        far_right_stats = ttk.Frame(self.stats_frame)
        far_right_stats.grid(row=0, column=3, padx=10, sticky="nw")

        # Economy stats
        ttk.Label(left_stats, text="Economy:", font=('Arial', 10, 'bold')).grid(row=0, column=0, pady=(0,5), sticky="w")
        self.coins_label = ttk.Label(left_stats, text=f"Coins: {self.stats['coins']}")
        self.coins_label.grid(row=1, column=0, pady=2, sticky="w")
        self.spent_label = ttk.Label(left_stats, text=f"Coins Spent: {self.stats['coins_spent']}")
        self.spent_label.grid(row=2, column=0, pady=2, sticky="w")
        self.earned_label = ttk.Label(left_stats, text=f"Coins Earned: {self.stats['coins_earned']}")
        self.earned_label.grid(row=3, column=0, pady=2, sticky="w")
        self.items_sold_label = ttk.Label(left_stats, text=f"Items Sold: {self.stats['items_sold']}")
        self.items_sold_label.grid(row=4, column=0, pady=2, sticky="w")

        # Chest stats
        ttk.Label(middle_stats, text="Chests:", font=('Arial', 10, 'bold')).grid(row=0, column=0, pady=(0,5), sticky="w")
        self.total_chests_label = ttk.Label(middle_stats, text=f"Total Opened: {self.stats['total_chests_opened']}")
        self.total_chests_label.grid(row=1, column=0, pady=2, sticky="w")

        # Chest counts per tier
        self.chest_labels = {}
        for i, tier in enumerate(self.chest_tiers, start=2):
            self.chest_labels[tier] = ttk.Label(middle_stats, text=f"{tier}: {self.stats['chests_opened'][tier]}")
            self.chest_labels[tier].grid(row=i, column=0, pady=2, sticky="w")

        # Rarity stats
        ttk.Label(right_stats, text="Rarities Found:", font=('Arial', 10, 'bold')).grid(row=0, column=0, pady=(0,5), sticky="w")
        self.rarity_labels = {}
        for i, rarity in enumerate(self.items.keys(), start=1):
            self.rarity_labels[rarity] = ttk.Label(right_stats, 
                                                text=f"{rarity.capitalize()}: {self.stats['rarities_found'][rarity]}",
                                                foreground=self.rarity_colors[rarity])
            self.rarity_labels[rarity].grid(row=i, column=0, pady=2, sticky="w")

        # Adventure stats
        ttk.Label(far_right_stats, text="Adventure Stats:", font=('Arial', 10, 'bold')).grid(row=0, column=0, pady=(0,5), sticky="w")
        self.adventures_label = ttk.Label(far_right_stats, text=f"Adventures Completed: {self.stats['adventures_completed']}")
        self.adventures_label.grid(row=1, column=0, pady=2, sticky="w")
        self.enemies_label = ttk.Label(far_right_stats, text=f"Total Enemies Defeated: {self.stats['total_enemies_defeated']}")
        self.enemies_label.grid(row=2, column=0, pady=2, sticky="w")
        self.total_exp_label = ttk.Label(far_right_stats, text=f"Total EXP Earned: {self.stats['total_exp_earned']}")
        self.total_exp_label.grid(row=3, column=0, pady=2, sticky="w")

    def create_chest_controls(self):
        self.chest_controls_frame = ttk.LabelFrame(self.left_frame, text="Chest Controls", padding="5")
        self.chest_controls_frame.grid(row=1, column=0, sticky="ew", padx=5, pady=5)
        self.chest_controls_frame.grid_columnconfigure(0, weight=1)

        chest_inner_frame = ttk.Frame(self.chest_controls_frame)
        chest_inner_frame.grid(row=0, column=0, sticky="ew")
        chest_inner_frame.grid_columnconfigure((0,1,2,3), weight=1)

        # Bulk opening toggle
        self.bulk_var = tk.BooleanVar(value=False)
        self.bulk_check = ttk.Checkbutton(chest_inner_frame, text="Open 10x", variable=self.bulk_var)
        self.bulk_check.grid(row=0, column=0, columnspan=4, pady=5)

        # Header labels
        ttk.Label(chest_inner_frame, text="Tier", width=15).grid(row=1, column=0, padx=5, sticky="ew")
        ttk.Label(chest_inner_frame, text="Keys", width=10).grid(row=1, column=1, padx=5, sticky="ew")
        ttk.Label(chest_inner_frame, text="Actions", width=20).grid(row=1, column=2, columnspan=2, padx=5, sticky="ew")

        # Chest tiers
        self.key_labels = {}
        for i, (tier, info) in enumerate(self.chest_tiers.items(), 2):
            ttk.Label(chest_inner_frame, text=f"{tier}", width=15).grid(row=i, column=0, padx=5, pady=2, sticky="ew")
            self.key_labels[tier] = ttk.Label(chest_inner_frame, text=f"{self.keys[tier]}", width=10)
            self.key_labels[tier].grid(row=i, column=1, padx=5, pady=2, sticky="ew")
            ttk.Button(chest_inner_frame, text=f"Buy ({info['price']})", width=15,
                    command=lambda t=tier: self.buy_key(t)).grid(row=i, column=2, padx=5, pady=2, sticky="ew")
            ttk.Button(chest_inner_frame, text="Open", width=15,
                    command=lambda t=tier: self.open_chest(t)).grid(row=i, column=3, padx=5, pady=2, sticky="ew")

    def create_filter_section(self):
        self.filter_frame = ttk.LabelFrame(self.left_frame, text="Filters", padding="5")
        self.filter_frame.grid(row=2, column=0, sticky="ew", padx=5, pady=5)
        self.filter_frame.grid_columnconfigure((0,1), weight=1)

        # Rarity filter
        self.rarity_var = tk.StringVar(value="All")
        self.rarity_filter = ttk.Combobox(self.filter_frame, textvariable=self.rarity_var,
                                        values=["All"] + list(self.items.keys()))
        self.rarity_filter.grid(row=0, column=0, padx=5, sticky="ew")
        self.rarity_filter.bind('<<ComboboxSelected>>', self.apply_filters)

        # Type filter
        self.type_var = tk.StringVar(value="All")
        self.type_filter = ttk.Combobox(self.filter_frame, textvariable=self.type_var,
                                    values=["All", "Armor", "Weapon", "Staff", 
                                            "Shield", "Ring", "Gloves", "Necklace"])
        self.type_filter.grid(row=0, column=1, padx=5, sticky="ew")
        self.type_filter.bind('<<ComboboxSelected>>', self.apply_filters)

    def create_action_buttons(self):
        self.action_frame = ttk.Frame(self.left_frame, padding="5")
        self.action_frame.grid(row=3, column=0, sticky="ew", padx=5, pady=5)
        self.action_frame.grid_columnconfigure((0,1), weight=1)

        ttk.Button(self.action_frame, text="Equip Selected", width=20,
                command=self.equip_selected_item).grid(row=0, column=0, padx=20, sticky="ew")
        ttk.Button(self.action_frame, text="Sell Selected", width=20,
                command=self.sell_items).grid(row=0, column=1, padx=20, sticky="ew")

    def create_inventory_section(self):
        # Configure grid for left_frame to allow expansion
        self.left_frame.grid_rowconfigure(4, weight=0)  # Counters frame row
        self.left_frame.grid_rowconfigure(5, weight=1)  # Inventory frame row
        self.left_frame.grid_columnconfigure(0, weight=1)
        
        # Item counts (counters) frame
        self.counters_frame = ttk.LabelFrame(self.left_frame, text="Item Counts", padding="5")
        self.counters_frame.grid(row=4, column=0, sticky="ew", padx=5, pady=5)
        self.counters_frame.grid_columnconfigure(tuple(range(len(self.items.keys()))), weight=1)

        self.counter_labels = {}
        for i, rarity in enumerate(self.items.keys()):
            self.counter_labels[rarity] = ttk.Label(self.counters_frame, text=f"{rarity.capitalize()}: 0")
            self.counter_labels[rarity].grid(row=0, column=i, padx=5, sticky="ew")

        # Inventory frame
        self.inventory_frame = ttk.LabelFrame(self.left_frame, text="Inventory", padding="5")
        self.inventory_frame.grid(row=5, column=0, sticky="nsew", padx=5, pady=5)
        
        # Create canvas for scrolling
        self.inventory_canvas = tk.Canvas(self.inventory_frame)
        self.inventory_scroll = ttk.Scrollbar(self.inventory_frame, orient="vertical", 
                                            command=self.inventory_canvas.yview)
        self.inventory_scroll.grid(row=0, column=1, sticky="ns")
        self.inventory_canvas.grid(row=0, column=0, sticky="nsew")
        self.inventory_canvas.configure(yscrollcommand=self.inventory_scroll.set)
        
        # Create frame inside canvas for inventory grid
        self.inventory_grid = ttk.Frame(self.inventory_canvas)
        self.inventory_canvas.create_window((0, 0), window=self.inventory_grid, anchor="nw")
        
        # Configure grid weights
        self.inventory_frame.grid_rowconfigure(0, weight=1)
        self.inventory_frame.grid_columnconfigure(0, weight=1)
        
        # Create style for inventory slots
        style = ttk.Style()
        style.configure('Inventory.TButton', 
                    padding=1,
                    width=8,
                    height=8)

        # Initialize inventory tracking
        self.inventory_buttons = []
        self.items_per_row = 8
        self.selected_item_index = None
        
        # Update scroll region when inventory grid changes
        self.inventory_grid.bind("<Configure>", 
            lambda e: self.inventory_canvas.configure(scrollregion=self.inventory_canvas.bbox("all")))


       
 


    
    ### WIDGETS UI STUFF 

    
    def buy_key(self, tier):
        price = self.chest_tiers[tier]["price"]
        amount = 10 if self.bulk_var.get() else 1
        total_price = price * amount
        
        if self.stats['coins'] >= total_price:
            self.stats['coins'] -= total_price
            self.stats['coins_spent'] += total_price
            self.keys[tier] += amount
            self.update_stats_display()  # Changed from update_economy_display
        else:
            messagebox.showwarning("Not Enough Coins", 
                                f"You need {total_price} coins to buy {amount} {tier} key(s)!")
            
            
    def sell_items(self):
        if self.selected_item_index is None:
            return
        
        inventory_index = self.filtered_indices[self.selected_item_index]
        item = self.inventory[inventory_index]
        rarity = item.split(":")[0].lower().replace(" item", "")
        value = self.price_multipliers[rarity]
        
        # Update stats
        self.stats['coins'] += value
        self.stats['coins_earned'] += value
        self.stats['items_sold'] += 1
        
        # Remove item
        del self.inventory[inventory_index]
        self.selected_item_index = None
        
        self.update_inventory_display()
        self.update_stats_display()
        self.update_counters()
        messagebox.showinfo("Item Sold", f"Sold item for {value} coins!")


    def raritySys(self, numItems=1, tier="Basic"):
        opened_items = []
        multipliers = self.chest_tiers[tier]["rarity_multipliers"]
        
        # Base rarity chances
        base_chances = {
            "common": 0.515,
            "uncommon": 0.215,
            "rare": 0.065,
            "epic": 0.015,
            "legendary": 0.005,
            "mythic": 0.0005,
            "divine": 0.00005,
            "unspoken": 0.00005
        }
        
        # Adjust chances using multipliers
        adjusted_chances = {
            rarity: base_chances[rarity] * multiplier
            for rarity, multiplier in multipliers.items()
        }
        
        # Remove excluded rarities (multiplier = 0) and normalize remaining chances
        total_chance = sum(adjusted_chances.values())
        normalized_chances = {
            rarity: chance / total_chance for rarity, chance in adjusted_chances.items() if chance > 0
        }
        
        # Cumulative probability mapping
        cumulative = []
        current = 0.0
        for rarity, prob in normalized_chances.items():
            current += prob
            cumulative.append((current, rarity))
        
        # Draw items
        for _ in range(numItems):
            draw = rand.random()
            rarity = next(r for c, r in cumulative if draw <= c)
            
            item_type = rand.choice(list(self.items[rarity].keys()))
            item_name = rand.choice(self.items[rarity][item_type])
            opened_items.append(f"{rarity.capitalize()} Item: {item_name}")
        
        return opened_items


    
    def open_chest(self, tier):
        amount = 10 if self.bulk_var.get() else 1
        
        if self.keys[tier] >= amount:
            self.keys[tier] -= amount
            new_items = self.raritySys(amount, tier)
            self.inventory.extend(new_items)
            
            # Update stats
            self.stats['chests_opened'][tier] += amount
            self.stats['total_chests_opened'] += amount


            
            # Count rarities
            for item in new_items:
                rarity = item.split(":")[0].lower().replace(" item", "")
                self.stats['rarities_found'][rarity] += 1
            
            self.update_inventory_display()
            self.update_stats_display()  # Changed from update_economy_display
            self.update_counters()
        else:
            messagebox.showwarning("Not Enough Keys", 
                                f"You need {amount} {tier} key(s) to open this chest!")

    





    def update_inventory_display(self):
        # Clear existing buttons
        for btn in self.inventory_buttons:
            btn.destroy()
        self.inventory_buttons.clear()
        
        # Get filtered items
        self.filtered_items, self.filtered_indices = self.get_filtered_items()
        
        # Create new buttons for each item
        for i, item in enumerate(self.filtered_items):
            row = i // self.items_per_row
            col = i % self.items_per_row
            
            name = item.split(":")[1].strip()
            rarity = item.split(":")[0].lower().replace(" item", "")
            
            # Create frame for item slot
            slot_frame = ttk.Frame(self.inventory_grid)
            slot_frame.grid(row=row, column=col, padx=2, pady=2)
            
            # Get item image
            item_image = self.image_manager.get_image(name)
            
            # Create button with image
            btn = ttk.Button(slot_frame, style='Inventory.TButton', image=item_image)
            btn.grid(sticky="nsew")
            
            # Store button reference
            self.inventory_buttons.append(btn)
            
            # Create tooltip with item info
            tooltip_text = f"{rarity.capitalize()} {name}"
            if name in ITEM_DETAILS:
                tooltip_text += f"\n{ITEM_DETAILS[name]['description']}"
            
            # Bind click events
            btn.bind("<Button-1>", lambda e, idx=i: self.on_inventory_click(idx))
            btn.bind("<Button-3>", lambda e, idx=i: self.show_context_menu(e, idx))
            
            # Add tooltip
            self.create_tooltip(btn, tooltip_text)


    def create_context_menu(self):
        self.context_menu = tk.Menu(self.root, tearoff=0)
        self.context_menu.add_command(label="Equip", command=self.equip_selected_item)
        self.context_menu.add_command(label="Sell", command=self.sell_items)

    def show_context_menu(self, event, index):
        self.selected_item_index = index
        self.context_menu.post(event.x_root, event.y_root)


    def create_tooltip(self, widget, text):
        def show_tooltip(event):
            x, y, _, _ = widget.bbox("insert")
            x += widget.winfo_rootx() + 25
            y += widget.winfo_rooty() + 20
            
            # Creates a toplevel window
            self.tooltip = tk.Toplevel(widget)
            self.tooltip.wm_overrideredirect(True)
            self.tooltip.wm_geometry(f"+{x}+{y}")
            
            label = ttk.Label(self.tooltip, text=text, justify='left',
                            background="#ffffff", relief='solid', borderwidth=3)
            label.pack()
        
        def hide_tooltip(event):
            if hasattr(self, 'tooltip'):
                self.tooltip.destroy()
        
        widget.bind('<Enter>', show_tooltip)
        widget.bind('<Leave>', hide_tooltip)

    def on_inventory_click(self, index):
        # Deselect all buttons
        for btn in self.inventory_buttons:
            btn.state(['!pressed'])
        
        # Select clicked button
        self.inventory_buttons[index].state(['pressed'])
        
        # Store selected item index
        self.selected_item_index = index

    def update_counters(self):
        counts = {rarity: 0 for rarity in self.items.keys()}
        for item in self.inventory:
            rarity = item.split(":")[0].lower().replace(" item", "")
            counts[rarity] += 1
        
        for rarity, count in counts.items():
            self.counter_labels[rarity].config(
                text=f"{rarity.capitalize()}: {count}",
                foreground=self.rarity_colors[rarity]
            )
    
    def get_filtered_items(self):
        rarity_filter = self.rarity_var.get().lower()
        type_filter = self.type_var.get().lower()
        
        filtered_items = []
        filtered_indices = []  # Store original indices
        
        for idx, item in enumerate(self.inventory):
            name = item.split(":")[1].strip()
            rarity = item.split(":")[0].lower().replace(" item", "")
            
            # Check rarity filter
            if rarity_filter != "all" and rarity != rarity_filter:
                continue
            
            # Check type filter
            if type_filter != "all":
                # Find item type by checking which category it belongs to
                item_type = None
                for type_name, items in self.items[rarity].items():
                    if any(item_name in name for item_name in items):
                        item_type = type_name
                        break
                
                if type_filter.lower() != item_type.lower():
                    continue
            
            filtered_items.append(item)
            filtered_indices.append(idx)
        
        return filtered_items, filtered_indices

    def apply_filters(self, event=None):
        self.update_inventory_display()



    def create_adventure_frame(self):
        # Adventure container
        adventure_container = ttk.Frame(self.right_frame)
        adventure_container.pack(fill="both", expand=True)
        
        # Adventures
        self.adventure_frame = ttk.LabelFrame(adventure_container, text="Adventures", padding="5")
        self.adventure_frame.pack(fill="x", pady=5)
        
        
           
        # Add adventure status
        self.adventure_status = ttk.Label(self.adventure_frame, 
                                        text=f"Active Adventures: {self.current_adventures}/{self.max_adventures}")
        self.adventure_status.pack(pady=5)
        
        # Add upgrade button
        self.upgrade_button = ttk.Button(self.adventure_frame,
                                   text=f"Upgrade Max Adventures ({self.upgrade_cost:,} coins)",
                                   command=self.upgrade_max_adventures)
        self.upgrade_button.pack(pady=5)
        
        
        for zone_name, zone_info in self.adventure.zones.items():
            frame = ttk.Frame(self.adventure_frame)
            frame.pack(fill="x", pady=2)
            
            ttk.Label(frame, text=f"{zone_name} (Level {zone_info['level']}+)").pack(side="left", padx=5)
            ttk.Label(frame, 
                    text=f"Rewards: {zone_info['coin_reward'][0]}-{zone_info['coin_reward'][1]} coins, "
                        f"{zone_info['exp_reward'][0]}-{zone_info['exp_reward'][1]} exp").pack(side="left", padx=5)
            
            ttk.Button(frame, 
                    text=f"Start ({zone_info['time']}s)", 
                    command=lambda z=zone_name: self.start_adventure(z)).pack(side="right", padx=5)
        
        # Combat Log
        self.combat_log_frame = ttk.LabelFrame(adventure_container, text="Combat Log", padding="5")
        self.combat_log_frame.pack(fill="both", expand=True, pady=5)
        
        self.combat_log = tk.Text(self.combat_log_frame, wrap=tk.WORD, height=20)
        self.combat_log.pack(fill="both", expand=True)
        
        combat_scroll = ttk.Scrollbar(self.combat_log_frame, command=self.combat_log.yview)
        combat_scroll.pack(side="right", fill="y")
        self.combat_log.config(yscrollcommand=combat_scroll.set)
        
        
    def upgrade_max_adventures(self):
        if self.stats['coins'] >= self.upgrade_cost:
            self.stats['coins'] -= self.upgrade_cost
            self.stats['coins_spent'] += self.upgrade_cost
            self.max_adventures += 1
            self.stats['max_adventures'] = self.max_adventures
            
            # Update the upgrade cost for next time
            self.upgrade_cost = math.floor(self.upgrade_cost * 1.5)  # Increase by 50% each time
            # Update the button text with new cost
            self.upgrade_button.config(text=f"Upgrade Max Adventures ({self.upgrade_cost:,} coins)")
            
            self.update_stats_display()
            messagebox.showinfo("Upgrade Successful", 
                            f"Maximum adventures increased to {self.max_adventures}!")
        else:
            messagebox.showwarning("Not Enough Coins",
                                f"You need {self.upgrade_cost:,} coins to upgrade!")
        
    def create_character_frame(self):
        self.character_frame = ttk.LabelFrame(self.right_frame, text="Character", padding="5")
        self.character_frame.pack(fill="x", pady=5)
        
        self.level_label = ttk.Label(self.character_frame, 
                                   text=f"Level: {self.character.level}")
        self.level_label.pack(side="left", padx=5)
        
        self.exp_label = ttk.Label(self.character_frame,
                                 text=f"EXP: {self.character.exp}/{self.character.exp_needed}")
        self.exp_label.pack(side="left", padx=5)
        
        self.stats_label = ttk.Label(self.character_frame,
                                   text=self.get_stats_text())
        self.stats_label.pack(side="left", padx=5)


    def create_equipment_frame(self):
        self.equipment_frame = ttk.LabelFrame(self.right_frame, text="Equipment", padding="5")
        self.equipment_frame.pack(fill="x", pady=5)
        
        # Create grid layout for equipment slots
        self.equipment_frame.grid_columnconfigure((0,1,2,3,4,5), weight=1)
        
        self.equipment_labels = {}
        self.equipment_images = {}
        self.equipment_buttons = {}  # Store the buttons/frames for each slot
        
        slots = ["armor", "weapon", "shield", "ring", "gloves", "necklace"]
        
        for i, slot in enumerate(slots):
            # Create frame for each slot
            slot_frame = ttk.Frame(self.equipment_frame)
            slot_frame.grid(row=0, column=i, padx=5, pady=5)
            
            # Slot label
            ttk.Label(slot_frame, 
                    text=slot.capitalize(),
                    anchor="center").pack(pady=(0,5))
            
            # Create button for item slot (similar to inventory)
            style = ttk.Style()
            style.configure('Equipment.TButton', 
                        padding=1,
                        width=8,
                        height=8)
            
            equip_btn = ttk.Button(slot_frame, style='Equipment.TButton')
            equip_btn.pack(pady=(0,5))
            self.equipment_buttons[slot] = equip_btn
            
            # Item name label
            self.equipment_labels[slot] = ttk.Label(slot_frame, 
                                                text="None",
                                                anchor="center",
                                                justify="center")
            self.equipment_labels[slot].pack(pady=(0,5))
            
            # Unequip button
            ttk.Button(slot_frame,
                    text="Unequip",
                    command=lambda s=slot: self.unequip_item(s)).pack()

     
        


    
    def unequip_item(self, slot):
        if self.character.equipped[slot]:
            item = self.character.equipped[slot]
            # Create inventory text format
            item_text = f"{item.rarity.capitalize()} Item: {item.name}"
            self.inventory.append(item_text)
            
            # Remove from equipped
            self.character.equipped[slot] = None
            self.character.compute_stats()
            
            # Update displays
            self.equipment_buttons[slot].configure(image="")
            self.equipment_labels[slot].config(text="None", foreground="black")
            self.update_inventory_display()
            self.update_character_display()
            self.update_counters()


    def equip_selected_item(self):
        if self.selected_item_index is None:
            return
        
        inventory_index = self.filtered_indices[self.selected_item_index]
        item_text = self.inventory[inventory_index]
        
        # Parse item information
        name = item_text.split(":")[1].strip()
        rarity = item_text.split(":")[0].lower().replace(" item", "")
        
        # Debug print
        print(f"Equipping item: {name} ({rarity})")
        
        # Determine item type
        item_type = None
        for type_name, items in self.items[rarity].items():
            if any(item_name.lower() in name.lower() for item_name in items):
                item_type = type_name
                break
        
        if not item_type:
            return
        
        # Convert staff to weapon slot
        slot = "weapon" if item_type in ["weapon", "staff"] else item_type
        
        # If there's already an item equipped, move it to inventory
        if self.character.equipped[slot]:
            old_item = self.character.equipped[slot]
            self.inventory.append(f"{old_item.rarity.capitalize()} Item: {old_item.name}")
        
        # Create and equip new item
        item = Item(name, rarity, item_type)
        self.character.equip_item(item)
        
        # Remove equipped item from inventory
        del self.inventory[inventory_index]
        self.selected_item_index = None
        
        # Update displays
        self.update_equipment_display()  # Make sure this is called
        self.update_inventory_display()
        self.update_character_display()
        self.update_counters()



    def update_stats_display(self):
        # Update economy stats
        self.coins_label.config(text=f"Coins: {self.stats['coins']}")
        self.spent_label.config(text=f"Coins Spent: {self.stats['coins_spent']}")
        self.earned_label.config(text=f"Coins Earned: {self.stats['coins_earned']}")
        self.items_sold_label.config(text=f"Items Sold: {self.stats['items_sold']}")
        
        # Update chest stats
        self.total_chests_label.config(text=f"Total Opened: {self.stats['total_chests_opened']}")
        for tier in self.chest_tiers:
            self.chest_labels[tier].config(text=f"{tier}: {self.stats['chests_opened'][tier]}")
            # Update key counts
            self.key_labels[tier].config(text=f"{self.keys[tier]}")
        
        # Update rarity stats
        for rarity in self.items.keys():
            self.rarity_labels[rarity].config(
                text=f"{rarity.capitalize()}: {self.stats['rarities_found'][rarity]}"
            )
        
        # Update adventure stats
        self.adventures_label.config(text=f"Adventures Completed: {self.stats['adventures_completed']}")
        self.enemies_label.config(text=f"Total Enemies Defeated: {self.stats['total_enemies_defeated']}")
        self.total_exp_label.config(text=f"Total EXP Earned: {self.stats['total_exp_earned']}")
        # Update adventure status
        self.adventure_status.config(text=f"Active Adventures: {self.current_adventures}/{self.max_adventures}")




    def add_to_combat_log(self, message):
        self.combat_log.insert(tk.END, message + "\n")
        self.combat_log.see(tk.END)

    def start_adventure(self, zone_name):
        if self.current_adventures >= self.max_adventures:
            self.add_to_combat_log(f"Cannot start new adventure. Maximum of {self.max_adventures} concurrent adventures reached!")
            return
        
        
        zone = self.adventure.zones[zone_name]

        # LEVEL REQ.
        if self.character.level < zone["level"]:
            self.add_to_combat_log(f"Need level {zone['level']} to enter {zone_name}!")
            return

        
        # Create unique identifier for this adventure
        adventure_id = f"{zone_name}_{self.current_adventures}"
        
        self.current_adventures += 1
        self.stats["active_adventures"] = self.current_adventures
        self.update_stats_display()
        

        

        # Initialize combat manager for this adventure
        self.combat_managers[adventure_id] = CombatManager(zone_name, zone, self.character)
        self.combat_managers[adventure_id].combat_active = True
        
        # Store adventure information
        self.active_adventures[adventure_id] = {
            'zone_name': zone_name,
            'zone': zone,
            'timer': Timer(zone["time"], lambda: self.complete_adventure(adventure_id))
        }
        
        # Add to combat log
        self.add_to_combat_log(f"\nEntering {zone_name}...")
        
        # Start combat tick for this adventure
        self.root.after(1000, lambda: self.combat_tick(adventure_id))
        
        # Start adventure timer
        self.active_adventures[adventure_id]['timer'].start()


    def combat_tick(self, adventure_id):
        if adventure_id not in self.combat_managers:
            return
            
        combat_manager = self.combat_managers[adventure_id]
        if not combat_manager.combat_active:
            return
        
        # Spawn new enemy if needed
        if not combat_manager.current_enemy or not combat_manager.current_enemy.is_alive():
            combat_manager.current_enemy = combat_manager.spawn_enemy()
            combat_manager.enemies_defeated += 1
            self.add_to_combat_log(f"\n[{combat_manager.zone_name}] Encountered {combat_manager.current_enemy.name}!")
        
        # Player attack
        damage_to_enemy = max(1, self.character.computed_stats["attack"] - 
                            combat_manager.current_enemy.defense)
        combat_manager.current_enemy.health -= damage_to_enemy
        self.add_to_combat_log(
            f"[{combat_manager.zone_name}] You deal {damage_to_enemy} damage to {combat_manager.current_enemy.name} "
            f"({combat_manager.current_enemy.health}/{combat_manager.current_enemy.max_health} HP)"
        )
        
        # Enemy attack if still alive
        if combat_manager.current_enemy.is_alive():
            damage_to_player = max(1, combat_manager.current_enemy.attack - 
                                self.character.computed_stats["defense"])
            self.character.computed_stats["health"] -= damage_to_player
            self.add_to_combat_log(
                f"[{combat_manager.zone_name}] {combat_manager.current_enemy.name} deals {damage_to_player} damage to you "
                f"({self.character.computed_stats['health']}/{self.character.computed_stats['max_health']} HP)"
            )
        
        # Check for player death
        if self.character.computed_stats["health"] <= 0:
            self.add_to_combat_log(f"\n[{combat_manager.zone_name}] You have been defeated!")
            combat_manager.combat_active = False
            self.character.computed_stats["health"] = 0
            self.update_character_display()
            return
        
        # Update character display
        self.update_character_display()
        
        # Schedule next combat tick if adventure is still active
        if adventure_id in self.active_adventures and combat_manager.combat_active:
            self.root.after(1000, lambda: self.combat_tick(adventure_id))

    def complete_adventure(self, adventure_id):
        self.root.after(0, lambda: self._complete_adventure(adventure_id))

    def _complete_adventure(self, adventure_id):
        if adventure_id not in self.combat_managers:
            return
            
        combat_manager = self.combat_managers[adventure_id]
        combat_manager.combat_active = False
        zone = self.active_adventures[adventure_id]['zone']
        
        self.current_adventures -= 1
        self.stats["active_adventures"] = self.current_adventures
        self.update_stats_display()
        
        # Calculate and apply rewards
        base_coins = rand.randint(*zone["coin_reward"])
        base_exp = rand.randint(*zone["exp_reward"])
        
        coins_earned = math.floor(base_coins * (1 + combat_manager.enemies_defeated * 0.2))
        exp_earned = math.floor(base_exp * (1 + combat_manager.enemies_defeated * 0.2))
        
        self.stats['coins'] += coins_earned
        self.stats['coins_earned'] += coins_earned
        self.stats['adventures_completed'] += 1
        self.stats['total_enemies_defeated'] += combat_manager.enemies_defeated
        self.stats['total_exp_earned'] += exp_earned
        self.character.gain_exp(exp_earned)
        
        self.add_to_combat_log(f"\n[{combat_manager.zone_name}] Adventure Complete!")
        self.add_to_combat_log(f"[{combat_manager.zone_name}] Enemies Defeated: {combat_manager.enemies_defeated}")
        self.add_to_combat_log(f"[{combat_manager.zone_name}] Earned: {coins_earned} coins and {exp_earned} exp!")
        
        # Cleanup
        del self.combat_managers[adventure_id]
        del self.active_adventures[adventure_id]
        
        self.update_character_display()
        self.update_stats_display()



    def update_character_display(self):
        self.level_label.config(text=f"Level: {self.character.level}")
        self.exp_label.config(text=f"EXP: {self.character.exp}/{self.character.exp_needed}")
        self.stats_label.config(text=self.get_stats_text())
    
    def update_equipment_display(self):
        for slot, item in self.character.equipped.items():
            if item:
                # Debug prints
                print(f"Updating equipment slot: {slot}")
                print(f"Item name: {item.name}")
                
                # Get item image
                item_image = self.image_manager.get_image(item.name)
                print(f"Got image for {item.name}: {item_image}")  # Debug print
                
                # Keep reference to image to prevent garbage collection
                if not hasattr(self, '_equipment_images'):
                    self._equipment_images = {}
                self._equipment_images[slot] = item_image
                
                # Update button image and text
                self.equipment_buttons[slot].configure(image=self._equipment_images[slot])
                self.equipment_labels[slot].config(
                    text=f"{item.name}\n({item.rarity.capitalize()})",
                    foreground=self.rarity_colors[item.rarity]
                )
                
                # Create tooltip
                tooltip_text = f"{item.rarity.capitalize()} {item.name}"
                if item.name in ITEM_DETAILS:
                    tooltip_text += f"\n{ITEM_DETAILS[item.name]['description']}"
                self.create_tooltip(self.equipment_buttons[slot], tooltip_text)
                
            else:
                # Clear slot
                if hasattr(self, '_equipment_images') and slot in self._equipment_images:
                    del self._equipment_images[slot]
                self.equipment_buttons[slot].configure(image="")
                self.equipment_labels[slot].config(
                    text="None",
                    foreground="black"
                )


    def get_stats_text(self):
        stats = self.character.computed_stats
        return f"ATK: {stats['attack']} | DEF: {stats['defense']} | HP: {stats['health']}/{stats['max_health']}"


def main():
    root = tk.Tk()
    app = LootSystemGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
