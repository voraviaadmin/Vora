CREATE TABLE IF NOT EXISTS cuisine_catalog (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  aliasesJson TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER
);

-- Minimal seed (expand anytime without app updates)
INSERT OR IGNORE INTO cuisine_catalog (id, label, aliasesJson, active, sortOrder) VALUES
('american', 'American', '["burgers","bbq","barbecue","steakhouse","diner"]', 1, 10),
('mexican', 'Mexican', '["tacos","tex mex","tex-mex","taqueria"]', 1, 20),
('italian', 'Italian', '["pasta","pizza","trattoria"]', 1, 30),
('chinese', 'Chinese', '["dim sum","szechuan","sichuan","cantonese"]', 1, 40),
('japanese', 'Japanese', '["sushi","ramen","izakaya"]', 1, 50),
('thai', 'Thai', '["pad thai","thai curry"]', 1, 60),
('indian', 'Indian', '["south indian","north indian","punjabi","biryani"]', 1, 70),
('mediterranean', 'Mediterranean', '["greek","turkish","levantine"]', 1, 80),
('middle_eastern', 'Middle Eastern', '["shawarma","kebab","kabob","falafel"]', 1, 90),
('korean', 'Korean', '["bbq","korean bbq","bibimbap"]', 1, 100),
('vietnamese', 'Vietnamese', '["pho","banh mi"]', 1, 110),
('seafood', 'Seafood', '["fish","oysters","crab","shrimp"]', 1, 120),
('vegetarian', 'Vegetarian', '["veggie","plant based","plant-based"]', 1, 130),
('vegan', 'Vegan', '["plant based","plant-based"]', 1, 140);
