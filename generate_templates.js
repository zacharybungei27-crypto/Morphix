import fs from 'fs';

const categories = ['featured', 'community', 'business', 'gaming', 'minimal', 'abstract'];
const tiers = ['base', 'pro', 'elite'];
const fonts = ['Inter', 'Roboto', 'Montserrat', 'Poppins', 'Playfair Display', 'Courier New'];
const kinds = ['circle', 'square', 'triangle', 'ellipse', 'polygon', 'line'];
const icons = ['crown', 'flare', 'headphones', 'checkroom', 'flight', 'style', 'settings_input_antenna', 'local_fire_department', 'bubble_chart', 'star', 'favorite', 'bolt', 'music_note', 'pets', 'rocket_launch', 'auto_awesome', 'palette', 'eco', 'diamond', 'anchor', 'face', 'lightbulb', 'sports_esports', 'science', 'verified', 'explore', 'bedtime', 'sunny', 'cloud'];
const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#1f2937', '#ffffff', '#000000'];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rNum = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

let newTemplates = [];
for(let i = 51; i <= 80; i++) {
  const t = {
    id: 'tpl_' + i,
    name: 'Template ' + i,
    category: rand(categories),
    tier: rand(tiers),
    desc: 'Auto-generated template ' + i,
    state: {
      canvas: { bg: rand(colors), bg2: rand(colors), gradient: true },
      shapes: Array.from({length: rNum(1, 4)}, () => ({
        kind: rand(kinds),
        x: rNum(20, 80), y: rNum(20, 80), w: rNum(10, 60), h: rNum(10, 60),
        fill: rand(colors), fill2: rand(colors), gradient: true,
        shadowY: rNum(2, 10), shadowBlur: rNum(10, 30), shadowColor: 'rgba(0,0,0,0.3)',
        sides: rNum(3, 6), thickness: rNum(2, 6)
      })),
      texts: Math.random() > 0.5 ? [{ content: 'TPL', x: 50, y: 50, size: rNum(8, 14), font: rand(fonts), color: rand(colors), weight: 800 }] : [],
      icons: Math.random() > 0.5 ? [{ name: rand(icons), x: rNum(20, 80), y: rNum(20, 80), size: rNum(8, 15), color: rand(colors), anim: 'float' }] : []
    }
  };
  
  // Format the template string
  const str = `  {
    id: '${t.id}', name: '${t.name}', category: '${t.category}', tier: '${t.tier}',
    desc: '${t.desc}',
    state: buildTplState(${JSON.stringify(t.state)})
  }`;
  newTemplates.push(str);
}

const content = fs.readFileSync('src/utils/content.js', 'utf8');
const searchRegEx = /  }\n];\n\nexport const ELEMENT_LIBRARY/;

if (searchRegEx.test(content)) {
  const replaceString = '  },\n' + newTemplates.join(',\n') + '\n];\n\nexport const ELEMENT_LIBRARY';
  fs.writeFileSync('src/utils/content.js', content.replace(searchRegEx, replaceString));
  console.log("Added 30 templates successfully");
} else {
  console.log("Could not find the exact string to replace.");
}
