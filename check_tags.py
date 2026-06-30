import re

with open('C:/Users/Plubs/Downloads/elective-guide/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

cards = re.split(r'<div class="card fade-up"', html)
for i, card in enumerate(cards[1:]):
    tags = re.findall(r'</?(?:ul|ol|li|div)[^>]*>', card)
    stack = []
    bad_lis = []
    for tag in tags:
        if tag.startswith('<div'):
            stack.append('div')
        elif tag == '</div>':
            if stack and stack[-1] == 'div':
                stack.pop()
        elif tag.startswith('<ul') or tag.startswith('<ol'):
            stack.append('ul')
        elif tag == '</ul>' or tag == '</ol>':
            if stack and stack[-1] == 'ul':
                stack.pop()
        elif tag.startswith('<li'):
            if not stack or stack[-1] != 'ul':
                bad_lis.append(tag)
    
    if bad_lis:
        title_match = re.search(r'<h3 class="card-title">(.*?)</h3>', card)
        title = title_match.group(1) if title_match else 'Unknown'
        print(f"Card: {title} has {len(bad_lis)} bad <li> tags.")
