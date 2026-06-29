<?php
/**
 * Global social links.
 *
 * @package Brand_Buddyy
 */

$socials = array(
	'linkedin'  => array( 'LinkedIn', 'in' ),
	'facebook'  => array( 'Facebook', 'f' ),
	'instagram' => array( 'Instagram', 'ig' ),
	'x'         => array( 'X', 'x' ),
);

foreach ( $socials as $key => $social ) {
	$url = brand_buddyy_option( 'social_' . $key );
	if ( ! $url ) {
		continue;
	}
	?>
	<a class="wa-offcanvas-social-link" href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer" aria-label="<?php echo esc_attr( $social[0] ); ?>">
		<span aria-hidden="true"><?php echo esc_html( $social[1] ); ?></span>
	</a>
	<?php
}
