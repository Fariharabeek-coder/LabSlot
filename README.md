# LabSlot — College Lab Availability and Booking System

LabSlot is a web application for checking Computer Science laboratory
availability and booking individual computer systems.

## Technologies

- HTML5
- CSS3
- JavaScript
- Bootstrap 5
- Browser localStorage

## Features

- Dashboard with laboratory and booking statistics
- Computer Science laboratory availability
- Individual computer selection
- Overlapping booking prevention
- Maintenance status
- Booking history and search
- Booking cancellation
- Admin login
- Add, edit, and delete laboratories
- Export booking records to CSV

## Default Laboratories

1. Computer Science Lab — 60 systems
2. Programming Lab — 45 systems
3. Advanced Computing Lab — 40 systems (maintenance)

## Admin Demo Login

Password: admin123

This is a demonstration login, not secure authentication for a real
college deployment.

## How to Run

1. Open the LabSlot folder in Visual Studio Code.
2. Install the Live Server extension.
3. Right-click index.html.
4. Select Open with Live Server.
5. The application opens in your browser.

An internet connection is needed to load Bootstrap and Bootstrap Icons
from their CDNs.

## Data Storage

LabSlot uses browser localStorage. It does not use MySQL or another
database.

Data is saved in the browser where the application is running.
Different browsers and devices have separate storage.

Clearing the browser's site data may delete saved bookings.

## Important

This application is a frontend demonstration. For real college use,
admin authentication, student identity verification, and access controls
should be implemented securely on a server.