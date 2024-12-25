import tkinter as tk
from tkinter import ttk, messagebox
import random as rand
from threading import Timer
import math

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
        
        rarity_multipliers = {
            "common": 1,
            "uncommon": 2,
            "rare": 4,
            "epic": 8,
            "legendary": 16,
            "mythic": 32,
            "divine": 64,
            "unspoken": 128
        }
        
        multiplier = rarity_multipliers[rarity]
        
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
        
        self.max_adventures = 1
        self.current_adventures = 0
        self.upgrade_cost = 100000

        # starting stats
        self.stats = {
            "coins": 1500,
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
        self.create_adventure_frame()
        self.create_character_frame()
        self.create_equipment_frame()
        self.filtered_items = []
        self.filtered_indices = []

        
    def create_widgets(self):
        # Create main container frames
        self.top_frame = ttk.Frame(self.root, padding="10")
        self.top_frame.pack(fill="x")
        
        # Create left and right main frames
        self.left_frame = ttk.Frame(self.root, padding="10")
        self.left_frame.pack(side="left", fill="both", expand=True)
        
        self.right_frame = ttk.Frame(self.root, padding="10")
        self.right_frame.pack(side="right", fill="both", expand=True)

     
        # stats frame:
        self.stats_frame = ttk.LabelFrame(self.left_frame, text="Game Stats", padding="5")
        self.stats_frame.pack(side="top", padx=5, fill="x", expand=True)

        # Create three columns for stats
        left_stats = ttk.Frame(self.stats_frame)
        left_stats.pack(side="left", padx=10)
        middle_stats = ttk.Frame(self.stats_frame)
        middle_stats.pack(side="left", padx=10)
        right_stats = ttk.Frame(self.stats_frame)
        right_stats.pack(side="left", padx=10)
        far_right_stats = ttk.Frame(self.stats_frame)
        far_right_stats.pack(side="left", padx=10)


        # Left column - Economy stats
        ttk.Label(left_stats, text="Economy:", font=('Arial', 10, 'bold')).pack(anchor="w", pady=(0,5))
        self.coins_label = ttk.Label(left_stats, text=f"Coins: {self.stats['coins']}")
        self.coins_label.pack(anchor="w", pady=2)
        self.spent_label = ttk.Label(left_stats, text=f"Coins Spent: {self.stats['coins_spent']}")
        self.spent_label.pack(anchor="w", pady=2)
        self.earned_label = ttk.Label(left_stats, text=f"Coins Earned: {self.stats['coins_earned']}")
        self.earned_label.pack(anchor="w", pady=2)
        self.items_sold_label = ttk.Label(left_stats, text=f"Items Sold: {self.stats['items_sold']}")
        self.items_sold_label.pack(anchor="w", pady=2)

        # Middle column - Chest stats
        ttk.Label(middle_stats, text="Chests:", font=('Arial', 10, 'bold')).pack(anchor="w", pady=(0,5))
        self.total_chests_label = ttk.Label(middle_stats, text=f"Total Opened: {self.stats['total_chests_opened']}")
        self.total_chests_label.pack(anchor="w", pady=2)

        # Chest counts per tier
        self.chest_labels = {}
        for tier in self.chest_tiers:
            self.chest_labels[tier] = ttk.Label(middle_stats, 
                                            text=f"{tier}: {self.stats['chests_opened'][tier]}")
            self.chest_labels[tier].pack(anchor="w", pady=2)

        # Right column - Rarity stats
        ttk.Label(right_stats, text="Rarities Found:", font=('Arial', 10, 'bold')).pack(anchor="w", pady=(0,5))
        self.rarity_labels = {}
        for rarity in self.items.keys():
            self.rarity_labels[rarity] = ttk.Label(right_stats, 
                                                text=f"{rarity.capitalize()}: {self.stats['rarities_found'][rarity]}",
                                                foreground=self.rarity_colors[rarity])
            self.rarity_labels[rarity].pack(anchor="w", pady=2)

        # Far right column - adventure stats
        ttk.Label(far_right_stats, text="Adventure Stats:", font=('Arial', 10, 'bold')).pack(anchor="w", pady=(10,5))
        self.adventures_label = ttk.Label(far_right_stats, text=f"Adventures Completed: {self.stats['adventures_completed']}")
        self.adventures_label.pack(anchor="w", pady=2)
        self.enemies_label = ttk.Label(far_right_stats, text=f"Total Enemies Defeated: {self.stats['total_enemies_defeated']}")
        self.enemies_label.pack(anchor="w", pady=2)
        self.total_exp_label = ttk.Label(far_right_stats, text=f"Total EXP Earned: {self.stats['total_exp_earned']}")
        self.total_exp_label.pack(anchor="w", pady=2)
        
        
        # Create frame for chest controls
        self.chest_controls_frame = ttk.LabelFrame(self.left_frame, text="Chest Controls", padding="5")
        self.chest_controls_frame.pack(side="top", padx=5, expand=True)
        
        # Create inner frame for controls
        chest_inner_frame = ttk.Frame(self.chest_controls_frame)
        chest_inner_frame.grid(row=0, column=0, padx=5, pady=5)


        # Bulk opening toggle
        self.bulk_var = tk.BooleanVar(value=False)
        self.bulk_check = ttk.Checkbutton(chest_inner_frame, 
                                        text="Open 10x", 
                                        variable=self.bulk_var)
        self.bulk_check.grid(row=0, column=3, columnspan=4, pady=5)

        # Create header labels
        ttk.Label(chest_inner_frame, text="Tier", width=15).grid(row=1, column=0, padx=5)
        ttk.Label(chest_inner_frame, text="Keys", width=10).grid(row=1, column=1, padx=5)
        ttk.Label(chest_inner_frame, text="Actions", width=20).grid(row=1, column=2, columnspan=2, padx=5)

        # Create frames for each chest tier
        self.key_labels = {}
        for i, (tier, info) in enumerate(self.chest_tiers.items(), 2):
            # Tier name
            ttk.Label(chest_inner_frame, 
                    text=f"{tier}", 
                    width=15).grid(row=i, column=0, padx=5, pady=2)
            
            # Key count
            self.key_labels[tier] = ttk.Label(chest_inner_frame, 
                                            text=f"{self.keys[tier]}", 
                                            width=10)
            self.key_labels[tier].grid(row=i, column=1, padx=5, pady=2)
            
            # Buy button
            ttk.Button(chest_inner_frame,
                    text=f"Buy ({info['price']})",
                    width=15,
                    command=lambda t=tier: self.buy_key(t)).grid(row=i, column=2, padx=5, pady=2)
            
            # Open button
            ttk.Button(chest_inner_frame,
                    text="Open",
                    width=15,
                    command=lambda t=tier: self.open_chest(t)).grid(row=i, column=3, padx=5, pady=2)
     
        
        # Filters
        self.filter_frame = ttk.LabelFrame(self.left_frame, text="Filters", padding="5")
        self.filter_frame.pack(fill="x", pady=5)
        
        # Rarity filter
        self.rarity_var = tk.StringVar(value="All")
        self.rarity_filter = ttk.Combobox(self.filter_frame, 
                                         textvariable=self.rarity_var,
                                         values=["All"] + list(self.items.keys()))
        self.rarity_filter.pack(side="left", padx=5)
        self.rarity_filter.bind('<<ComboboxSelected>>', self.apply_filters)
        
        # Type filter
        self.type_var = tk.StringVar(value="All")
        self.type_filter = ttk.Combobox(self.filter_frame,
                               textvariable=self.type_var,
                               values=["All", "Armor", "Weapon", "Staff", 
                                     "Shield", "Ring", "Gloves", "Necklace"])
        self.type_filter.pack(side="left", padx=5)
        self.type_filter.bind('<<ComboboxSelected>>', self.apply_filters)
        

        # Action buttons frame
        self.action_frame = ttk.Frame(self.left_frame, padding="5")
        self.action_frame.pack(fill="x", pady=5)

        # Create a container frame to center the buttons
        button_container = ttk.Frame(self.action_frame)
        button_container.pack(expand=True)

        self.equip_button = ttk.Button(button_container,
                                    text="Equip Selected",
                                    width=20,
                                    command=self.equip_selected_item)
        self.equip_button.pack(side="left", padx=20)

        self.sell_button = ttk.Button(button_container,
                                    text="Sell Selected",
                                    width=20,
                                    command=self.sell_items)
        self.sell_button.pack(side="left", padx=20)


        # Counters frame
        self.counters_frame = ttk.LabelFrame(self.left_frame, text="Item Counts", padding="5")
        self.counters_frame.pack(fill="x", pady=5)
        
        self.counter_labels = {}
        for rarity in self.items.keys():
            self.counter_labels[rarity] = ttk.Label(self.counters_frame, 
                                                  text=f"{rarity.capitalize()}: 0")
            self.counter_labels[rarity].pack(side="left", padx=5)
        
        # Inventory
        self.inventory_frame = ttk.LabelFrame(self.left_frame, text="Inventory", padding="5")
        self.inventory_frame.pack(fill="both", expand=True)
        
        # Create scrollable inventory display
        self.inventory_scroll = ttk.Scrollbar(self.inventory_frame)
        self.inventory_scroll.pack(side="right", fill="y")
        
        self.inventory_display = tk.Listbox(self.inventory_frame,
                                          yscrollcommand=self.inventory_scroll.set,
                                          selectmode="multiple",
                                          width=70,
                                          height=25)
        self.inventory_display.pack(fill="both", expand=True)
        
        self.inventory_scroll.config(command=self.inventory_display.yview)
    
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
        selected_indices = self.inventory_display.curselection()
        if not selected_indices:
            return
        
        total_value = 0
        inventory_indices = sorted([self.filtered_indices[i] for i in selected_indices], reverse=True)
        
        for index in inventory_indices:
            item = self.inventory[index]
            rarity = item.split(":")[0].lower().replace(" item", "")
            value = self.price_multipliers[rarity]
            total_value += value
            del self.inventory[index]
        
        # Update stats
        self.stats['coins'] += total_value
        self.stats['coins_earned'] += total_value
        self.stats['items_sold'] += len(inventory_indices)
        
        self.update_inventory_display()
        self.update_stats_display()
        self.update_counters()
        messagebox.showinfo("Items Sold", f"Sold items for {total_value} coins!")


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
        self.inventory_display.delete(0, tk.END)
        self.filtered_items, self.filtered_indices = self.get_filtered_items()  # Store filtered indices
        
        for item in self.filtered_items:
            rarity = item.split(":")[0].lower().replace(" item", "")
            self.inventory_display.insert(tk.END, item)
            self.inventory_display.itemconfig(tk.END, fg=self.rarity_colors[rarity])
    
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
        
        self.equipment_labels = {}
        for slot in ["armor", "weapon", "shield", "ring", "gloves", "necklace"]:
            frame = ttk.Frame(self.equipment_frame)
            frame.pack(fill="x", pady=2)
            
            self.equipment_labels[slot] = ttk.Label(frame, text=f"{slot.capitalize()}: None")
            self.equipment_labels[slot].pack(side="left", padx=5)
            
            ttk.Button(frame, 
                    text="Unequip",
                    command=lambda s=slot: self.unequip_item(s)).pack(side="right", padx=5)
     
        


    
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
            self.equipment_labels[slot].config(text=f"{slot.capitalize()}: None", foreground="black")
            self.update_inventory_display()
            self.update_character_display()
            self.update_counters()


    def equip_selected_item(self):
        selected_indices = self.inventory_display.curselection()
        if not selected_indices:
            return
        
        # Get the actual inventory index using filtered_indices
        display_index = selected_indices[0]
        inventory_index = self.filtered_indices[display_index]
        item_text = self.inventory[inventory_index]
        
        # Create Item object from inventory text
        name = item_text.split(":")[1].strip()
        rarity = item_text.split(":")[0].lower().replace(" item", "")
        
        # Determine item type by checking which category the item name belongs to
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
        
        # Update equipment display
        self.equipment_labels[slot].config(
            text=f"{slot.capitalize()}: {name} ({rarity.capitalize()})",
            foreground=self.rarity_colors[rarity]
        )
        
        # Remove equipped item from inventory using the correct index
        del self.inventory[inventory_index]
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
        
        self.current_adventures += 1
        self.stats["active_adventures"] = self.current_adventures
        self.update_stats_display()
        
        # if self.character.level < zone["level"]:
        #     self.add_to_combat_log(f"Need level {zone['level']} to enter {zone_name}!")
        #     return
        
        # Clear previous combat log
        self.combat_log.delete(1.0, tk.END)
        
        # Initialize combat manager
        self.combat_manager = CombatManager(zone_name, zone, self.character)
        self.combat_manager.combat_active = True
        
        # Start the combat loop
        self.adventure.current_adventure = zone_name
        self.add_to_combat_log(f"Entering {zone_name}...")
        
        # Schedule the first enemy encounter
        self.root.after(1000, self.combat_tick)
        
        # Start adventure timer
        self.adventure.timer = Timer(zone["time"], self.complete_adventure)
        self.adventure.timer.start()

    def combat_tick(self):
        if not self.combat_manager.combat_active:
            return
        
        # Spawn new enemy if needed
        if not self.combat_manager.current_enemy or not self.combat_manager.current_enemy.is_alive():
            self.combat_manager.current_enemy = self.combat_manager.spawn_enemy()
            self.combat_manager.enemies_defeated += 1
            self.add_to_combat_log(f"\nEncountered {self.combat_manager.current_enemy.name}!")
        
        # Player attack
        damage_to_enemy = max(1, self.character.computed_stats["attack"] - 
                            self.combat_manager.current_enemy.defense)
        self.combat_manager.current_enemy.health -= damage_to_enemy
        self.add_to_combat_log(
            f"You deal {damage_to_enemy} damage to {self.combat_manager.current_enemy.name} "
            f"({self.combat_manager.current_enemy.health}/{self.combat_manager.current_enemy.max_health} HP)"
        )
        
        # Enemy attack if still alive
        if self.combat_manager.current_enemy.is_alive():
            damage_to_player = max(1, self.combat_manager.current_enemy.attack - 
                                self.character.computed_stats["defense"])
            self.character.computed_stats["health"] -= damage_to_player
            self.add_to_combat_log(
                f"{self.combat_manager.current_enemy.name} deals {damage_to_player} damage to you "
                f"({self.character.computed_stats['health']}/{self.character.computed_stats['max_health']} HP)"
            )
        
        # Check for player death
        if self.character.computed_stats["health"] <= 0:
            self.add_to_combat_log("\nYou have been defeated!")
            self.combat_manager.combat_active = False
            self.adventure.current_adventure = None
            self.character.computed_stats["health"] = 0  # Set health to 0 instead of negative
            self.update_character_display()
            return
        
        # Update character display
        self.update_character_display()
        
        # Schedule next combat tick if adventure is still active
        if self.adventure.current_adventure and self.combat_manager.combat_active:
            self.root.after(1000, self.combat_tick)  # Combat tick every 1 second


    def complete_adventure(self):
        self.root.after(0, self._complete_adventure)

    
    def _complete_adventure(self):
        self.combat_manager.combat_active = False
        zone = self.adventure.zones[self.adventure.current_adventure]
        
        self.current_adventures -= 1
        self.stats["active_adventures"] = self.current_adventures
        self.update_stats_display()
        
        # Check if player survived
        if self.character.computed_stats["health"] <= 0:
            self.add_to_combat_log("\nYou were defeated!")
            self.character.computed_stats["health"] = self.character.computed_stats["max_health"]
            self.adventure.current_adventure = None
            self.update_character_display()
            return
        
        # Calculate rewards (now based on enemies defeated)
        base_coins = rand.randint(*zone["coin_reward"])
        base_exp = rand.randint(*zone["exp_reward"])
        
        # Multiply rewards by number of enemies defeated
        coins_earned = math.floor(base_coins * (1 + self.combat_manager.enemies_defeated * 0.2))
        exp_earned = math.floor(base_exp * (1 + self.combat_manager.enemies_defeated * 0.2))
        
        # Update stats and coins
        self.stats['coins'] += coins_earned
        self.stats['coins_earned'] += coins_earned
        self.stats['adventures_completed'] += 1
        self.stats['total_enemies_defeated'] += self.combat_manager.enemies_defeated
        self.stats['total_exp_earned'] += exp_earned
        self.character.gain_exp(exp_earned)
        
        # Heal player
        self.character.computed_stats["health"] = self.character.computed_stats["max_health"]
        
        self.add_to_combat_log(f"\nAdventure Complete!")
        self.add_to_combat_log(f"Enemies Defeated: {self.combat_manager.enemies_defeated}")
        self.add_to_combat_log(f"Earned: {coins_earned} coins and {exp_earned} exp!")
        
        self.adventure.current_adventure = None
        self.update_character_display()
        self.update_stats_display()




    def update_character_display(self):
        self.level_label.config(text=f"Level: {self.character.level}")
        self.exp_label.config(text=f"EXP: {self.character.exp}/{self.character.exp_needed}")
        self.stats_label.config(text=self.get_stats_text())
    
    def update_equipment_display(self):
        for slot, item in self.character.equipped.items():
            if item:
                self.equipment_labels[slot].config(
                    text=f"{slot.capitalize()}: {item.name} ({item.rarity.capitalize()})",
                    foreground=self.rarity_colors[item.rarity]
                )
            else:
                self.equipment_labels[slot].config(
                    text=f"{slot.capitalize()}: None",
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