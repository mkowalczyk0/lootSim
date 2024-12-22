import tkinter as tk
from tkinter import ttk, messagebox
import random as rand
import json
from datetime import datetime
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
            "weapon": None,
            "shield": None
        }
        self.computed_stats = self.base_stats.copy()

    def equip_item(self, item):
        item_type = "armor" if "armor" in item.name.lower() else "weapon" if "sword" in item.name.lower() else "shield"
        self.equipped[item_type] = item
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
        
        # Base stats multiplied by rarity multiplier
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
        
        # Changed this part to use item_type instead of checking the name
        if item_type == "armor":
            self.stats = {
                "max_health": 20 * multiplier,
                "health": 20 * multiplier
            }
        elif item_type == "weapon":
            self.stats = {
                "attack": 8 * multiplier
            }
        else:  # Shield
            self.stats = {
                "defense": 3 * multiplier
            }

class Enemy:
    def __init__(self, name, level):
        self.name = name
        self.level = level
        self.health = 50 * level
        self.max_health = 50 * level
        self.attack = 5 * level
        self.defense = 3 * level

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
                "time": 30  # seconds
            },
            "Forest": {
                "level": 5,
                "enemies": ["Wolf", "Bandit", "Dark Elf"],
                "coin_reward": (40, 80),
                "exp_reward": (60, 100),
                "time": 60
            },
            "Dark Cave": {
                "level": 10,
                "enemies": ["Troll", "Dark Beast", "Shadow Knight"],
                "coin_reward": (100, 200),
                "exp_reward": (150, 250),
                "time": 120
            },
            "Dragon's Lair": {
                "level": 20,
                "enemies": ["Dragon Cultist", "Dragon Spawn", "Ancient Dragon"],
                "coin_reward": (300, 600),
                "exp_reward": (400, 800),
                "time": 300
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
        
        # Economy variables
        self.coins = 1000  # Starting coins
        self.key_price = 100
        self.keys = 5  # Starting keys
        
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
            "divine": "#FFD700",      # Gold
            "unspoken": "#FF1493"     # Deep Pink
        }
        
        self.items = {
            "common": ["Wooden Armor", "Wooden Sword", "Wooden Shield"],
            "uncommon": ["Iron Armor", "Iron Sword", "Iron Shield"],
            "rare": ["Gold Armor", "Gold Sword", "Gold Shield"],
            "epic": ["Diamond Armor", "Diamond Sword", "Diamond Shield"],
            "legendary": ["Ruby Armor", "Ruby Sword", "Ruby Shield"],
            "mythic": ["King Armor", "King Sword", "King Shield"],
            "divine": ["God Armor", "God Sword", "God Shield"],
            "unspoken": ["Banisher Armor", "Banisher Sword", "Banisher Shield"]
        }
        
        self.inventory = []
        self.create_widgets()
        self.update_counters()
        self.create_character_frame()
        self.create_adventure_frame()
        self.create_equipment_frame()

        
    def create_widgets(self):
        # Create main container frames
        self.top_frame = ttk.Frame(self.root, padding="10")
        self.top_frame.pack(fill="x")
        
        # Create left and right main frames
        self.left_frame = ttk.Frame(self.root, padding="10")
        self.left_frame.pack(side="left", fill="both", expand=True)
        
        self.right_frame = ttk.Frame(self.root, padding="10")
        self.right_frame.pack(side="right", fill="both", expand=True)
        
        # Economy display
        self.economy_frame = ttk.LabelFrame(self.top_frame, text="Economy", padding="5")
        self.economy_frame.pack(side="left", padx=5)
        
        self.coins_label = ttk.Label(self.economy_frame, text=f"Coins: {self.coins}")
        self.coins_label.pack(side="left", padx=5)
        
        self.keys_label = ttk.Label(self.economy_frame, text=f"Keys: {self.keys}")
        self.keys_label.pack(side="left", padx=5)
        
        self.buy_key_button = ttk.Button(self.economy_frame, 
                                        text=f"Buy Key ({self.key_price} coins)", 
                                        command=self.buy_key)
        self.buy_key_button.pack(side="left", padx=5)
        
        # Control buttons
        self.control_frame = ttk.Frame(self.top_frame, padding="5")
        self.control_frame.pack(side="left", padx=5)
        
        self.open_button = ttk.Button(self.control_frame, 
                                     text="Open Chest (1 Key)", 
                                     command=self.open_chest)
        self.open_button.pack(side="left", padx=5)
        
        self.sell_button = ttk.Button(self.control_frame, 
                                     text="Sell Selected", 
                                     command=self.sell_items)
        self.sell_button.pack(side="left", padx=5)
        # Equip Button
        self.equip_button = ttk.Button(self.control_frame,
                                    text="Equip Selected",
                                    command=self.equip_selected_item)
        self.equip_button.pack(side="left", padx=5)
        
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
                                       values=["All", "Armor", "Sword", "Shield"])
        self.type_filter.pack(side="left", padx=5)
        self.type_filter.bind('<<ComboboxSelected>>', self.apply_filters)
        
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
    
    def buy_key(self):
        if self.coins >= self.key_price:
            self.coins -= self.key_price
            self.keys += 1
            self.update_economy_display()
        else:
            messagebox.showwarning("Not Enough Coins", 
                                 f"You need {self.key_price} coins to buy a key!")
    
    def sell_items(self):
        selected_indices = self.inventory_display.curselection()
        if not selected_indices:
            return
        
        total_value = 0
        # We need to remove items from highest index to lowest to avoid shifting issues
        for index in sorted(selected_indices, reverse=True):
            item = self.inventory[index]
            rarity = item.split(":")[0].lower().replace(" item", "")
            value = self.price_multipliers[rarity]
            total_value += value
            
            # Remove item from inventory
            del self.inventory[index]
        
        self.coins += total_value
        self.update_inventory_display()
        self.update_economy_display()
        self.update_counters()
        messagebox.showinfo("Items Sold", f"Sold items for {total_value} coins!")
    
    def raritySys(self, numItems=1):
        opened_items = []
        for _ in range(numItems):
            drawNum = rand.random()
            if drawNum <= 0.00005:  # 0.005%
                opened_items.append(f"Unspoken Item: {rand.choice(self.items['unspoken'])}")
            elif drawNum <= 0.0005:  # 0.05%
                opened_items.append(f"Divine Item: {rand.choice(self.items['divine'])}")
            elif drawNum <= 0.005:  # 0.5%
                opened_items.append(f"Mythic Item: {rand.choice(self.items['mythic'])}")
            elif drawNum <= 0.015:  # 1% 
                opened_items.append(f"Legendary Item: {rand.choice(self.items['legendary'])}")
            elif drawNum <= 0.065:  # 5% 
                opened_items.append(f"Epic Item: {rand.choice(self.items['epic'])}")
            elif drawNum <= 0.215:  # 15%
                opened_items.append(f"Rare Item: {rand.choice(self.items['rare'])}")
            elif drawNum <= 0.515:  # 30%
                opened_items.append(f"Uncommon Item: {rand.choice(self.items['uncommon'])}")
            else:  # Remaining ~48.445%
                opened_items.append(f"Common Item: {rand.choice(self.items['common'])}")
        return opened_items
    
    def open_chest(self):
        if self.keys <= 0:
            messagebox.showwarning("No Keys", "You need a key to open a chest!")
            return
            
        self.keys -= 1
        new_items = self.raritySys()
        self.inventory.extend(new_items)
        self.update_inventory_display()
        self.update_economy_display()
        self.update_counters()
    
    def update_economy_display(self):
        self.coins_label.config(text=f"Coins: {self.coins}")
        self.keys_label.config(text=f"Keys: {self.keys}")
    
    def update_inventory_display(self):
        self.inventory_display.delete(0, tk.END)
        filtered_items = self.get_filtered_items()
        for item in filtered_items:
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
        for item in self.inventory:
            if rarity_filter != "all":
                if rarity_filter not in item.lower():
                    continue
            
            if type_filter != "all":
                if type_filter not in item.lower():
                    continue
            
            filtered_items.append(item)
        
        return filtered_items
    
    def apply_filters(self, event=None):
        self.update_inventory_display()

    def create_character_frame(self):
        self.character_frame = ttk.LabelFrame(self.left_frame, text="Character", padding="5")
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

    def create_adventure_frame(self):
        # Adventure container
        adventure_container = ttk.Frame(self.right_frame)
        adventure_container.pack(fill="both", expand=True)
        
        # Adventures
        self.adventure_frame = ttk.LabelFrame(adventure_container, text="Adventures", padding="5")
        self.adventure_frame.pack(fill="x", pady=5)
        
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
    
    def create_equipment_frame(self):
        self.equipment_frame = ttk.LabelFrame(self.left_frame, text="Equipment", padding="5")
        self.equipment_frame.pack(fill="x", pady=5)

        
        self.equipment_labels = {}
        for slot in ["armor", "weapon", "shield"]:
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
        
        item_index = selected_indices[0]
        item_text = self.inventory[item_index]
        
        # Create Item object from inventory text
        name = item_text.split(":")[1].strip()
        rarity = item_text.split(":")[0].lower().replace(" item", "")
        item_type = "armor" if "armor" in name.lower() else "weapon" if "sword" in name.lower() else "shield"
        
        item = Item(name, rarity, item_type)
        self.character.equip_item(item)
        
        # Update equipment display
        slot = "armor" if "armor" in name.lower() else "weapon" if "sword" in name.lower() else "shield"
        self.equipment_labels[slot].config(
            text=f"{slot.capitalize()}: {name} ({rarity.capitalize()})",
            foreground=self.rarity_colors[rarity]
        )
        
        # Remove equipped item from inventory
        del self.inventory[item_index]
        self.update_inventory_display()
        self.update_character_display()
        self.update_counters()

    def add_to_combat_log(self, message):
        self.combat_log.insert(tk.END, message + "\n")
        self.combat_log.see(tk.END)

    def start_adventure(self, zone_name):
        if self.adventure.current_adventure:
            self.add_to_combat_log("Adventure already in progress!")
            return
            
        zone = self.adventure.zones[zone_name]
        
        if self.character.level < zone["level"]:
            self.add_to_combat_log(f"Need level {zone['level']} to enter {zone_name}!")
            return
        
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
        
        # Combat round
        if self.character.computed_stats["health"] > 0:
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
        
        # Update character display
        self.update_character_display()
        
        # Schedule next combat tick if adventure is still active
        if self.adventure.current_adventure:
            self.root.after(1000, self.combat_tick)  # Combat tick every 1 seconds

    def complete_adventure(self):
        self.combat_manager.combat_active = False
        zone = self.adventure.zones[self.adventure.current_adventure]
        
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
        
        self.coins += coins_earned
        self.character.gain_exp(exp_earned)
        
        # Heal player
        self.character.computed_stats["health"] = self.character.computed_stats["max_health"]
        
        self.add_to_combat_log(f"\nAdventure Complete!")
        self.add_to_combat_log(f"Enemies Defeated: {self.combat_manager.enemies_defeated}")
        self.add_to_combat_log(f"Earned: {coins_earned} coins and {exp_earned} exp!")
        
        self.adventure.current_adventure = None
        self.update_character_display()
        self.update_economy_display()


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