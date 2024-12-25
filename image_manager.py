from PIL import Image, ImageTk
import os

class ImageManager:
    def __init__(self):
        self.images = {}
        self.default_image = None
        
    def load_images(self, image_mappings, size=(64, 64)):
        for item_name, image_path in image_mappings.items():
            try:
                image = Image.open(image_path)
                image = image.resize(size)
                self.images[item_name] = ImageTk.PhotoImage(image)
            except Exception as e:
                print(f"Failed to load image for {item_name}: {e}")
                
        # Load default image for items without specific images
        try:
            default_image = Image.open("assets\images\items\missingTex.png")
            self.default_image = ImageTk.PhotoImage(default_image.resize(size))
        except:
            print("Failed to load default image")
    
    def get_image(self, item_name):
        return self.images.get(item_name, self.default_image)