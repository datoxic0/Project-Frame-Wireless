import os
import string

def get_drives():
    drives = []
    for d in string.ascii_uppercase:
        drive = '%s:\\' % d
        if os.path.exists(drive):
            drives.append(drive)
    return drives

print(get_drives())
