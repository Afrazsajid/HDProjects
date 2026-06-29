<?php
/**
 * Homepage contact section.
 *
 * @package Brand_Buddyy
 */

brand_buddyy_render_home_section( 'contact', 'contact' );

$status = isset( $_GET['contact'] ) ? sanitize_key( wp_unslash( $_GET['contact'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
if ( $status ) :
	$messages = array(
		'success' => __( 'Thanks — your project details were sent successfully.', 'brand-buddyy' ),
		'invalid' => __( 'Please complete your name, a valid email, and your project details.', 'brand-buddyy' ),
		'error'   => __( 'The message could not be sent. Please email us directly instead.', 'brand-buddyy' ),
	);
	if ( isset( $messages[ $status ] ) ) :
		?>
		<p class="bb-form-message" role="status"><?php echo esc_html( $messages[ $status ] ); ?></p>
		<?php
	endif;
endif;
