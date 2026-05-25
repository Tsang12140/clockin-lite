# Clockin App Design Rules

This document records the public visual baseline for Clockin App. Keep UI changes consistent with the existing product language unless a task explicitly changes the design system.

## Logo

| Use | File |
| --- | --- |
| App icon | `public/logo.svg` |
| Favicon | `public/favicon.svg` |

Logo language:

- Rounded square blue gradient background.
- Clock ring and hand as the primary symbol.
- Small white circular accent in the lower-right corner.
- Do not stretch, recolor, add text inside the icon, or use only one symbol fragment.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| Brand | `#3370FF` | Buttons, selected states, links |
| Brand dark | `#1A3A8F` | Page titles, key numbers |
| Brand light | `#60A5FA` | Gradients, soft hover states |
| Page background | `#F0F4FA` | App background |
| Card background | `#FFFFFF` | Cards, list rows |
| Filter background | `#E8EEF8` | Segmented controls |
| Selected background | `#EBF0FF` | Calendar and table highlights |
| Success | `#16A34A` | Completed states |
| Danger | `#DC2626` | Errors, destructive actions |
| Warning | `#D97706` | Leave, warnings, reminders |

## Typography

Use the app's existing system font stack:

```css
font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

Weight rules:

- Page titles: `font-semibold`
- Section/card titles and employee names: `font-medium` or `font-semibold` where already established
- Labels, descriptions, dates: `font-normal`
- Key amounts and statistics: `font-bold`
- Avoid large areas of `font-bold` or `font-black`

The old global `bold-mode` setting was removed. Do not reintroduce a user-facing font-weight switch unless explicitly requested.

## Components

- Cards: `bg-white rounded-2xl shadow-sm p-4`
- Small controls: `rounded-lg`
- Segmented controls: use the existing `.seg-ctrl` class from `app/globals.css`
- Bottom tabs: keep the order stable in `components/BottomNav.tsx`
- Drawers: use `vaul` with a centered drag handle, left close button, and centered title
- Toasts: prefer lightweight toast-style feedback over blocking dialogs for success states

## Mobile Rules

- The daily attendance path should stay fast enough for repeated shop-floor use.
- Touch targets should be at least 44px where practical.
- Hour input should prefer steppers with 0.5 increments.
- Text must not overflow buttons, cards, or compact table cells.

## Language

The primary UI language is Chinese. Avoid unnecessary English labels such as `Profile`, `Record`, `History`, `Overview`, or `Dashboard` in user-facing surfaces.
