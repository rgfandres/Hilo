import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors duration-100 disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        default: 'border border-border bg-bg text-fg hover:bg-bg-3 active:bg-bg-4',
        primary: 'bg-inverted text-inverted-fg hover:bg-gray-11',
        ghost: 'text-fg-2 hover:bg-bg-4 hover:text-fg',
        danger: 'text-danger-fg hover:bg-danger-bg',
        /** Estado "armado" de la doble pulsación (móvil) */
        armed: 'bg-inverted text-inverted-fg ring-4 ring-gray-5',
      },
      size: {
        sm: 'h-6 px-2 text-sm max-md:h-9 max-md:px-3',
        md: 'h-7 px-2.5 text-base max-md:h-10 max-md:px-3',
        lg: 'h-9 px-3.5 text-md',
        /** Botón de acción del móvil: 44 px, ancho completo */
        touch: 'h-11 w-full px-4 text-md rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean
  /** Acción en curso: deshabilitado, con «…» y sin cambiar de ancho */
  cargando?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', asChild, cargando, disabled, children, ...props }, ref) => {
    const Comp: React.ElementType = asChild ? Slot : 'button'
    const propio = React.useRef<HTMLButtonElement | null>(null)
    const [ancho, setAncho] = React.useState<number | undefined>(undefined)
    // Congela el ancho al empezar a cargar para que el botón no «salte»
    React.useLayoutEffect(() => { if (cargando && propio.current) setAncho(propio.current.offsetWidth); if (!cargando) setAncho(undefined) }, [cargando])
    const setRef = (el: HTMLButtonElement | null) => {
      propio.current = el
      if (typeof ref === 'function') ref(el); else if (ref) ref.current = el
    }
    return (
      <Comp ref={setRef} type={asChild ? undefined : type} data-variant={variant ?? 'default'} aria-busy={cargando || undefined}
        disabled={asChild ? undefined : disabled || cargando}
        style={ancho ? { minWidth: ancho, ...props.style } : props.style}
        className={cn(button({ variant, size }), className)} {...props}>
        {cargando && !asChild ? <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />{children}</span> : children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'
