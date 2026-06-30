import re

with open('C:/Users/Plubs/Downloads/elective-guide/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix 1: University Section
# Move the closing </div> from line 807 to after the 124 KMITL card.
# The 124 KMITL card ends at around line 894 with </div>.
# We want:
#           </div> <!-- KMITL end -->
#         </div> <!-- cards-grid end -->
#       </div> <!-- container end -->
#     </section>

# Let's use string replace.
# The exact text around line 807:
#         </div>
#       
# 
#           <!-- NEW CARD:  110 วิทยาลัยแพทยศาสตร์และการสาธารณสุข
old_block1 = ""\"        </div>
      

          <!-- NEW CARD:  110 วิทยาลัยแพทยศาสตร์และการสาธารณสุข\"""

new_block1 = ""\"      

          <!-- NEW CARD:  110 วิทยาลัยแพทยศาสตร์และการสาธารณสุข\"""
if old_block1 in html:
    html = html.replace(old_block1, new_block1, 1)
    print("Fixed 1: removed early closing cards-grid div.")
else:
    print("Could not find old_block1")

# The exact text around line 894:
#           </div>
#         </div>
#     </section>
old_block2 = ""\"          </div>
        </div>
    </section>\"""
new_block2 = ""\"          </div>
        </div>
      </div>
    </section>\"""
if old_block2 in html:
    html = html.replace(old_block2, new_block2, 1)
    print("Fixed 2: added closing cards-grid and container div.")
else:
    print("Could not find old_block2")

# Fix 3: Specialized Hospital Section
# It ends around line 1168.
#         </div>
#       
# 
#           <!-- NEW CARD:  สถาบันกัลยาณ์ราชนครินทร์ -->
old_block3 = ""\"        </div>
      

          <!-- NEW CARD:  สถาบันกัลยาณ์ราชนครินทร์ -->\"""
new_block3 = ""\"      

          <!-- NEW CARD:  สถาบันกัลยาณ์ราชนครินทร์ -->\"""
if old_block3 in html:
    html = html.replace(old_block3, new_block3, 1)
    print("Fixed 3: removed early closing cards-grid div for spec.")
else:
    print("Could not find old_block3")

# Around line 1227:
#           </div>
#         </div>
# 
#     <!-- ===== SECTION: REGIONAL HOSPITALS 402-428 ===== -->
old_block4 = ""\"          </div>
        </div>

    <!-- ===== SECTION: REGIONAL HOSPITALS 402-428 ===== -->\"""
new_block4 = ""\"          </div>
        </div>
      </div>
    </section>

    <!-- ===== SECTION: REGIONAL HOSPITALS 402-428 ===== -->\"""
if old_block4 in html:
    html = html.replace(old_block4, new_block4, 1)
    print("Fixed 4: added closing cards-grid and container div for spec.")
else:
    print("Could not find old_block4")

with open('C:/Users/Plubs/Downloads/elective-guide/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Done fixing cards-grid.")
