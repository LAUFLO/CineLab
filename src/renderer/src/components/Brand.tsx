import appIcon from '../assets/app-icon.png'
import wordmarkLight from '../assets/wordmark-light.png'
import wordmarkDark from '../assets/wordmark-dark.png'

interface BrandIconProps {
  size?: number
  className?: string
}

export function BrandIcon({ size = 24, className }: BrandIconProps) {
  return (
    <img
      src={appIcon}
      width={size}
      height={size}
      alt="CineLab"
      className={className}
      draggable={false}
    />
  )
}

interface BrandWordmarkProps {
  height?: number
  className?: string
}

export function BrandWordmark({ height = 20, className }: BrandWordmarkProps) {
  return (
    <span className={`brand-wordmark${className ? ` ${className}` : ''}`} style={{ height }}>
      <img
        src={wordmarkLight}
        alt="CineLab"
        className="brand-wordmark__light"
        draggable={false}
      />
      <img
        src={wordmarkDark}
        alt="CineLab"
        className="brand-wordmark__dark"
        draggable={false}
      />
    </span>
  )
}
