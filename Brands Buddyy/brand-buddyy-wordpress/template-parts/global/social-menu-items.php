<?php
/**
 * Footer social menu items.
 *
 * @package Brand_Buddyy
 */

$socials = array(
	'linkedin'  => 'LinkedIn',
	'facebook'  => 'Facebook',
	'instagram' => 'Instagram',
	'x'         => 'X / Twitter',
);

foreach ( $socials as $key => $label ) {
	$url = brand_buddyy_option( 'social_' . $key );
	if ( ! $url ) {
		continue;
	}
	?>
	<li><a href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html( $label ); ?></a></li>
	<?php
}
